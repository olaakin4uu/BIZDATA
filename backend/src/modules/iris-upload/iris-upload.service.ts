import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type Anthropic from '@anthropic-ai/sdk';
import { PrismaService } from '../../prisma/prisma.service';
import { CryptoService } from '../../common/services/crypto.service';
import { AuditService } from '../../common/services/audit.service';
import { SubmissionsService } from '../submissions/submissions.service';
import { LlmFactory } from '../iris/llm/llm.factory';
import { detectSpreadsheetKind, parseCsvText, SchemaTemplate, spreadsheetConversionAdvice } from '../submissions/submission-parser';
import { xlsxToCsvText } from '../submissions/spreadsheet-to-csv';
import { assertSection29ProviderType } from '../../common/section29';
import {
  ColumnMapping,
  MAPPING_SYSTEM,
  MAPPING_JSON_SCHEMA,
  buildMappingPrompt,
  columnSamples,
  resolveMapping,
  applyMapping,
  validateCorrected,
  previewRows,
  toCsv,
} from './import-plan';

interface Ctx {
  providerId: string;
  providerUserId?: string;
}
interface Period {
  periodLabel: string;
  periodYear?: number;
  periodQuarter?: number;
  periodMonth?: number;
}

const DRAFT_TTL_MS = 30 * 60 * 1000;
const MAX_ROWS = 60_000;

/**
 * IRIS Upload Assistant — interactive cleanup of a messy provider CSV.
 * analyze → (revalidate on edits) → approve. Approval ALWAYS goes through the
 * normal SubmissionsService.upload() pipeline, so §29, period-ended, required
 * columns, one-per-period and all-or-nothing are enforced identically to a
 * hand-uploaded file. The LLM only proposes a column mapping; it never sees or
 * rewrites the data, and it never fabricates values.
 */
@Injectable()
export class IrisUploadService {
  private readonly logger = new Logger(IrisUploadService.name);

  constructor(
    private prisma: PrismaService,
    private crypto: CryptoService,
    private audit: AuditService,
    private submissions: SubmissionsService,
    private llm: LlmFactory,
  ) {}

  private async providerType(providerId: string): Promise<string> {
    const p = await this.prisma.dataProvider.findUnique({ where: { id: providerId } });
    if (!p) throw new NotFoundException('Provider not found');
    // Same §29 gate the real upload applies — surfaced here so the assistant
    // refuses out-of-scope provider types up front with a clear message.
    assertSection29ProviderType(p.providerType);
    return p.providerType;
  }

  private ruleSummary(schema: SchemaTemplate, providerType: string): string[] {
    const required = schema.columns.filter((c) => c.required).map((c) => c.name).join(', ');
    return [
      `Your account (${providerType}) is an eligible §29 financial institution.`,
      'You can only submit for a reporting period that has already ended.',
      `Required columns for ${providerType}: ${required}.`,
      'Every row must be valid — if any row fails, the whole file is rejected. I fix structure and formatting, but I never invent missing values.',
      'One submission per period — a repeat needs an authorised resubmission permission.',
    ];
  }

  private async proposeMapping(schema: SchemaTemplate, samples: { header: string; samples: string[] }[]): Promise<ColumnMapping[]> {
    if (!this.llm.enabled) return [];
    try {
      const client = this.llm.create();
      const req = {
        model: this.llm.model,
        max_tokens: 1500,
        system: MAPPING_SYSTEM,
        messages: [{ role: 'user', content: buildMappingPrompt(schema, samples) }],
        thinking: { type: 'adaptive' },
        output_config: { effort: 'low', format: { type: 'json_schema', schema: MAPPING_JSON_SCHEMA } },
      } as unknown as Anthropic.MessageCreateParamsNonStreaming;
      const res = await client.messages.create(req);
      const text = res.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('');
      const parsed = JSON.parse(text) as { mappings?: unknown };
      if (!Array.isArray(parsed.mappings)) return [];
      return parsed.mappings
        .filter((m): m is { source: string; target: string; confidence?: number } => !!m && typeof m === 'object' && typeof (m as any).source === 'string' && typeof (m as any).target === 'string')
        .map((m) => ({ source: m.source, target: m.target, confidence: typeof m.confidence === 'number' ? m.confidence : 0.9 }));
    } catch (e) {
      this.logger.warn(`IRIS Upload mapping fell back to heuristic: ${(e as Error).message}`);
      return [];
    }
  }

  private preview(schema: SchemaTemplate, providerType: string, headers: string[], rows: Record<string, string>[], mapping: ColumnMapping[], draftId: string, fileName: string | undefined, aiUsed: boolean, expiresAt: Date, periodLabel?: string) {
    const corrected = applyMapping(headers, rows, mapping, schema);
    const validation = validateCorrected(corrected.rows, schema, providerType, periodLabel);
    return {
      draftId,
      providerType,
      fileName,
      aiUsed,
      canonicalFields: schema.columns.map((c) => ({ name: c.name, required: c.required, type: c.type })),
      mapping,
      sample: previewRows(headers, rows, corrected),
      stats: { total: rows.length, accept: validation.accept, reject: validation.reject },
      issues: validation.issues,
      rules: this.ruleSummary(schema, providerType),
      expiresAt: expiresAt.toISOString(),
    };
  }

  private decrypt(draft: { cipher: string }): { headers: string[]; rows: Record<string, string>[] } {
    const clear = this.crypto.decrypt(draft.cipher);
    if (!clear) throw new BadRequestException('Draft could not be read.');
    return JSON.parse(clear);
  }

  private async getDraft(ctx: Ctx, draftId: string) {
    const draft = await this.prisma.importDraft.findFirst({ where: { id: draftId, providerId: ctx.providerId } });
    if (!draft) throw new NotFoundException('Upload draft not found.');
    if (draft.status !== 'PENDING') throw new BadRequestException(`This draft is already ${draft.status.toLowerCase()}.`);
    if (draft.expiresAt.getTime() < Date.now()) throw new BadRequestException('This draft has expired — please re-upload the file.');
    return draft;
  }

  async analyze(ctx: Ctx, file: { buffer: Buffer; originalname?: string }, period: Period) {
    if (!file?.buffer) throw new BadRequestException('A CSV or Excel file is required.');
    if (!period.periodLabel) throw new BadRequestException('A reporting period is required.');
    const providerType = await this.providerType(ctx.providerId);
    const schema = await this.submissions.getEffectiveSchema(providerType);

    // Same file handling as the classic uploader: an Excel workbook (.xlsx) is read
    // as CSV text; .xls / .ods / zip get Save-As-CSV advice. (Read raw, a workbook is
    // binary noise with NUL bytes that Postgres refuses - providers saw a bare 500.)
    if (!file.buffer.length) throw new BadRequestException('That file is empty.');
    const ext = (file.originalname ?? '').toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
    const kind = detectSpreadsheetKind(file.buffer);
    let text: string;
    if (kind === 'xlsx') {
      text = (await xlsxToCsvText(file.buffer)).csv;
    } else if (kind) {
      throw new BadRequestException(`${spreadsheetConversionAdvice(kind)} Renaming the file to .csv does not convert it - it has to be saved as CSV.`);
    } else if (ext && ext !== 'csv' && ext !== 'txt' && ext !== 'xlsx') {
      throw new BadRequestException(
        `I can read CSV or Excel (.xlsx) files. This one is a .${ext} file. Open it in your spreadsheet program, choose File → Save As, ` +
        `set the type to CSV ("CSV (Comma delimited)" in Excel, "Text CSV" in LibreOffice), then upload the .csv file.`,
      );
    } else {
      text = file.buffer.toString('utf8');
      if (text.includes('\u0000')) {
        throw new BadRequestException('That file is not a CSV or Excel file. Save it as CSV (Comma delimited) and upload the .csv file.');
      }
    }

    const { headers, rows } = parseCsvText(text);
    if (headers.length === 0 || rows.length === 0) throw new BadRequestException('I could not read any data rows from that file.');
    if (rows.length > MAX_ROWS) throw new BadRequestException(`That file has ${rows.length.toLocaleString()} rows — please use the standard uploader for files over ${MAX_ROWS.toLocaleString()} rows.`);

    const llmMappings = await this.proposeMapping(schema, columnSamples(headers, rows));
    const mapping = resolveMapping(headers, schema, llmMappings);
    const corrected = applyMapping(headers, rows, mapping, schema);
    const validation = validateCorrected(corrected.rows, schema, providerType, period.periodLabel);
    const expiresAt = new Date(Date.now() + DRAFT_TTL_MS);

    const draft = await this.prisma.importDraft.create({
      data: {
        providerId: ctx.providerId,
        providerUserId: ctx.providerUserId,
        fileName: file.originalname,
        cipher: this.crypto.encrypt(JSON.stringify({ headers, rows })) ?? '',
        mapping: mapping as unknown as object,
        status: 'PENDING',
        periodLabel: period.periodLabel,
        periodYear: period.periodYear,
        periodQuarter: period.periodQuarter,
        periodMonth: period.periodMonth,
        totalRows: rows.length,
        acceptRows: validation.accept,
        rejectRows: validation.reject,
        expiresAt,
      },
    });

    await this.audit.log({
      actorType: 'PROVIDER_USER',
      actorId: ctx.providerUserId,
      action: 'AI_UPLOAD_PROPOSED',
      entity: 'ImportDraft',
      entityId: draft.id,
      afterJson: { fileName: file.originalname, mapping, stats: { total: rows.length, accept: validation.accept, reject: validation.reject }, aiUsed: llmMappings.length > 0 },
    });

    return this.preview(schema, providerType, headers, rows, mapping, draft.id, file.originalname, llmMappings.length > 0, expiresAt, period.periodLabel);
  }

  async revalidate(ctx: Ctx, draftId: string, mappingOverride: { source: string; target: string }[]) {
    const draft = await this.getDraft(ctx, draftId);
    const { headers, rows } = this.decrypt(draft);
    const providerType = await this.providerType(ctx.providerId);
    const schema = await this.submissions.getEffectiveSchema(providerType);

    const validTargets = new Set(schema.columns.map((c) => c.name));
    const bySource = new Map((mappingOverride ?? []).map((m) => [m.source, m.target]));
    const mapping: ColumnMapping[] = headers.map((h) => {
      const t = bySource.get(h) ?? '';
      return { source: h, target: validTargets.has(t) ? t : '', confidence: 1 };
    });

    const corrected = applyMapping(headers, rows, mapping, schema);
    const validation = validateCorrected(corrected.rows, schema, providerType, draft.periodLabel);
    await this.prisma.importDraft.update({
      where: { id: draft.id },
      data: { mapping: mapping as unknown as object, acceptRows: validation.accept, rejectRows: validation.reject },
    });

    return this.preview(schema, providerType, headers, rows, mapping, draft.id, draft.fileName ?? undefined, false, draft.expiresAt, draft.periodLabel);
  }

  async approve(ctx: Ctx, draftId: string) {
    const draft = await this.getDraft(ctx, draftId);
    const { headers, rows } = this.decrypt(draft);
    const providerType = await this.providerType(ctx.providerId);
    const schema = await this.submissions.getEffectiveSchema(providerType);
    const mapping = (draft.mapping as unknown as ColumnMapping[]) ?? resolveMapping(headers, schema, []);

    const corrected = applyMapping(headers, rows, mapping, schema);
    const csv = toCsv(corrected.headers, corrected.rows);

    // Push the cleaned CSV through the UNCHANGED upload pipeline — all rules apply.
    const submission = await this.submissions.upload({
      providerId: draft.providerId,
      fileName: `iris-cleaned-${(draft.fileName || 'upload').replace(/\.(xlsx|csv|txt)$/i, '')}.csv`,
      fileBuffer: Buffer.from(csv, 'utf8'),
      periodLabel: draft.periodLabel,
      periodYear: draft.periodYear ?? undefined,
      periodQuarter: draft.periodQuarter ?? undefined,
      periodMonth: draft.periodMonth ?? undefined,
      submittedByUserId: draft.providerUserId ?? undefined,
    });

    await this.prisma.importDraft.update({
      where: { id: draft.id },
      data: { status: 'APPROVED', resultSubmissionId: (submission as { id?: string }).id ?? null },
    });
    await this.audit.log({
      actorType: 'PROVIDER_USER',
      actorId: ctx.providerUserId,
      action: 'AI_UPLOAD_APPROVED',
      entity: 'DataSubmission',
      entityId: (submission as { id?: string }).id,
      afterJson: { draftId: draft.id, mapping },
    });

    return submission;
  }

  async cancel(ctx: Ctx, draftId: string) {
    const draft = await this.getDraft(ctx, draftId);
    await this.prisma.importDraft.update({ where: { id: draft.id }, data: { status: 'CANCELLED' } });
    return { status: 'CANCELLED' };
  }
}
