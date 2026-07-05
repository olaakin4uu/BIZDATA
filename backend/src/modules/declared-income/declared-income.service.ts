import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/services/audit.service';
import { CryptoService } from '../../common/services/crypto.service';
import { PiiAccessService } from '../../common/services/pii-access.service';

@Injectable()
export class DeclaredIncomeService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private crypto: CryptoService,
    private pii: PiiAccessService,
  ) {}

  async create(dto: any, actorId?: string) {
    if (!dto.taxpayerId || !dto.year || dto.assessableIncome == null) {
      throw new BadRequestException('taxpayerId, year, assessableIncome required');
    }
    const tp = await this.prisma.taxpayer.findUnique({ where: { id: dto.taxpayerId } });
    if (!tp) throw new NotFoundException('Taxpayer not found');

    const rec = await this.prisma.declaredIncome.upsert({
      where: { taxpayerId_year: { taxpayerId: dto.taxpayerId, year: dto.year } },
      update: {
        assessableIncome: new Prisma.Decimal(dto.assessableIncome),
        source: dto.source,
        notes: dto.notes,
      },
      create: {
        taxpayerId: dto.taxpayerId,
        year: dto.year,
        assessableIncome: new Prisma.Decimal(dto.assessableIncome),
        source: dto.source,
        notes: dto.notes,
      },
    });

    await this.audit.log({
      actorType: 'STAFF',
      actorId,
      staffId: actorId,
      action: 'UPSERT_DECLARED_INCOME',
      entity: 'DeclaredIncome',
      entityId: rec.id,
    });

    return rec;
  }

  async findAll(query: any) {
    const page = Math.max(1, parseInt(query.page || '1', 10));
    const limit = Math.min(200, Math.max(1, parseInt(query.limit || '50', 10)));
    const where: Prisma.DeclaredIncomeWhereInput = {
      ...(query.taxpayerId ? { taxpayerId: query.taxpayerId } : {}),
      ...(query.year ? { year: parseInt(query.year, 10) } : {}),
    };
    const [records, total] = await Promise.all([
      this.prisma.declaredIncome.findMany({
        where,
        include: { taxpayer: { select: { id: true, ninEnc: true, cacRcNumber: true, firstName: true, lastName: true, businessName: true, type: true } } },
        orderBy: [{ year: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.declaredIncome.count({ where }),
    ]);
    const clear = await this.pii.canRevealPii();
    const decrypted = records.map((r) => ({
      ...r,
      taxpayer: r.taxpayer ? { ...r.taxpayer, nin: this.pii.reveal(this.crypto.decrypt(r.taxpayer.ninEnc), 'nin', clear) } : r.taxpayer,
    }));
    return { records: decrypted, total, page, limit };
  }

  // Columns the importer understands. Order here drives the sample template.
  static readonly IMPORT_COLUMNS = [
    'taxpayernin',
    'taxpayercacrcnumber',
    'year',
    'assessableincome',
    'source',
    'notes',
  ] as const;
  static readonly REQUIRED_COLUMNS = ['year', 'assessableincome'] as const;

  /**
   * Process a declared-income CSV. When `dryRun` is true nothing is written —
   * every row is validated and matched exactly as a real import would, so the
   * returned counts are an accurate preview. The same code path runs for both
   * the validate step and the commit, so a clean preview means a clean import.
   */
  async processCsv(csvText: string, opts: { dryRun: boolean; actorId?: string; source?: string }) {
    const grid = parseCsv(csvText);
    if (grid.length < 2) throw new BadRequestException('CSV needs a header row plus at least one data row.');

    const headers = grid[0].map((h) => h.trim().toLowerCase());

    // Header validation — fail loudly and early rather than silently skipping
    // every data row with a vague "invalid year/income".
    const known = new Set<string>(DeclaredIncomeService.IMPORT_COLUMNS);
    const missing = DeclaredIncomeService.REQUIRED_COLUMNS.filter((c) => !headers.includes(c));
    const unknown = headers.filter((h) => h && !known.has(h));
    const hasIdentifier = headers.includes('taxpayernin') || headers.includes('taxpayercacrcnumber');
    if (missing.length || !hasIdentifier) {
      const problems: string[] = [];
      if (missing.length) problems.push(`missing required column(s): ${missing.join(', ')}`);
      if (!hasIdentifier) problems.push('need at least one of taxpayernin or taxpayercacrcnumber');
      throw new BadRequestException(`CSV header problem — ${problems.join('; ')}.`);
    }

    // Normalise CSV rows → the shared row shape. lineNo maps back to the file.
    const rows: ImportRow[] = [];
    for (let i = 1; i < grid.length; i++) {
      const values = grid[i];
      if (values.every((v) => v.trim() === '')) continue;
      const r: Record<string, string> = {};
      headers.forEach((h, idx) => { r[h] = (values[idx] ?? '').trim(); });
      rows.push({
        lineNo: i + 1,
        nin: r.taxpayernin || undefined,
        rc: r.taxpayercacrcnumber || undefined,
        year: r.year,
        assessableIncome: r.assessableincome,
        source: r.source || undefined,
        notes: r.notes || undefined,
      });
    }

    const warnings = unknown.length ? [`Unknown column(s) ignored: ${unknown.join(', ')}.`] : [];
    return this.processRows(rows, { ...opts, warnings });
  }

  /**
   * Process a JSON payload from a partner platform. Accepts either a bare array
   * of declarations or `{ declarations: [...] }`. Each item is validated exactly
   * like a CSV row so partner and staff imports behave identically.
   */
  async processJson(
    payload: any,
    opts: { dryRun: boolean; source?: string; partnerName?: string },
  ) {
    const items = Array.isArray(payload) ? payload : payload?.declarations;
    if (!Array.isArray(items) || items.length === 0) {
      throw new BadRequestException('Body must be a non-empty array of declarations (or { declarations: [...] }).');
    }
    if (items.length > 10000) {
      throw new BadRequestException('Batch too large — send at most 10,000 declarations per request.');
    }
    const rows: ImportRow[] = items.map((it: any, idx: number) => ({
      lineNo: idx + 1, // 1-based item index for partner-friendly error messages
      nin: str(it?.nin ?? it?.taxpayerNin ?? it?.taxpayernin),
      rc: str(it?.rcNumber ?? it?.taxpayerCacRcNumber ?? it?.taxpayercacrcnumber ?? it?.cacRcNumber),
      year: str(it?.year),
      assessableIncome: str(it?.assessableIncome ?? it?.assessableincome ?? it?.income),
      source: str(it?.source),
      notes: str(it?.notes),
    }));
    return this.processRows(rows, { ...opts, itemLabel: 'Item' });
  }

  /**
   * The shared import core. Takes normalised rows (from CSV or JSON), validates
   * and matches each to an existing taxpayer, and upserts a declaration —
   * unless `dryRun`, in which case it only counts what would happen. This is the
   * single source of truth for import behaviour across staff and partner paths.
   */
  private async processRows(
    rows: ImportRow[],
    opts: { dryRun: boolean; actorId?: string; source?: string; partnerName?: string; warnings?: string[]; itemLabel?: string },
  ) {
    const label = opts.itemLabel ?? 'Row';
    let created = 0, updated = 0, skipped = 0;
    const errors: string[] = [];
    // Track (taxpayerId, year) seen this batch so a duplicate within the same
    // upload is reported instead of silently double-counting a create+update.
    const seen = new Set<string>();

    for (const row of rows) {
      const where = `${label} ${row.lineNo}`;
      try {
        const year = parseInt(row.year ?? '', 10);
        const income = parseFloat((row.assessableIncome ?? '').replace(/,/g, ''));
        if (!year || year < 1900 || year > 2200) {
          errors.push(`${where}: invalid or out-of-range year "${row.year ?? ''}".`);
          skipped++; continue;
        }
        if (isNaN(income) || income < 0) {
          errors.push(`${where}: invalid assessable income "${row.assessableIncome ?? ''}".`);
          skipped++; continue;
        }
        if (!row.nin && !row.rc) {
          errors.push(`${where}: missing taxpayer identifier (NIN or RC number).`);
          skipped++; continue;
        }

        const tp = await this.prisma.taxpayer.findFirst({
          where: {
            OR: [
              ...(row.nin ? [{ ninIndex: this.crypto.blindIndex(row.nin)! }] : []),
              ...(row.rc ? [{ cacRcNumber: row.rc }] : []),
            ],
          },
          select: { id: true },
        });
        if (!tp) {
          errors.push(`${where}: no taxpayer matches ${row.nin ? `NIN ${maskId(row.nin)}` : `RC ${row.rc}`}.`);
          skipped++; continue;
        }

        const dedupeKey = `${tp.id}:${year}`;
        if (seen.has(dedupeKey)) {
          errors.push(`${where}: duplicate of an earlier entry in this batch (same taxpayer + year).`);
          skipped++; continue;
        }
        seen.add(dedupeKey);

        const existing = await this.prisma.declaredIncome.findUnique({
          where: { taxpayerId_year: { taxpayerId: tp.id, year } },
          select: { id: true, source: true, notes: true },
        });
        const defaultSource = opts.source || 'MANUAL_IMPORT';

        if (existing) {
          if (!opts.dryRun) {
            await this.prisma.declaredIncome.update({
              where: { id: existing.id },
              data: {
                assessableIncome: new Prisma.Decimal(income),
                source: row.source || opts.source || existing.source,
                notes: row.notes || existing.notes,
              },
            });
          }
          updated++;
        } else {
          if (!opts.dryRun) {
            await this.prisma.declaredIncome.create({
              data: {
                taxpayerId: tp.id,
                year,
                assessableIncome: new Prisma.Decimal(income),
                source: row.source || defaultSource,
                notes: row.notes || null,
              },
            });
          }
          created++;
        }
      } catch (err: any) {
        errors.push(`${where}: ${err.message}`);
        skipped++;
      }
    }

    const totalRows = created + updated + skipped;
    if (!opts.dryRun) {
      await this.audit.log({
        actorType: opts.partnerName ? 'SYSTEM' : 'STAFF',
        actorId: opts.actorId,
        staffId: opts.actorId,
        action: opts.partnerName ? 'PARTNER_IMPORT_DECLARED_INCOME' : 'IMPORT_DECLARED_INCOME',
        entity: 'DeclaredIncome',
        afterJson: { created, updated, skipped, ...(opts.partnerName ? { partner: opts.partnerName } : {}) },
      });
    }

    return {
      dryRun: opts.dryRun,
      totalRows,
      created,
      updated,
      skipped,
      warnings: opts.warnings ?? [],
      errors: errors.slice(0, 200),
      errorCount: errors.length,
    };
  }

  /** Sample CSV template with the exact header and two illustrative rows. */
  sampleTemplate(): string {
    const header = DeclaredIncomeService.IMPORT_COLUMNS.join(',');
    return [
      header,
      '12345678901,,2025,4500000,SELF_ASSESSMENT,"Filed Q1, revised"',
      ',RC123456,2025,88000000.50,AUDITED_ACCOUNTS,',
      '',
    ].join('\n');
  }
}

// ─── RFC-4180-style CSV parser ────────────────────────────────────────────────
// Handles quoted fields, embedded commas and newlines, and escaped quotes ("").
// Strips a leading UTF-8 BOM. Returns an array of rows, each an array of cells.
function parseCsv(text: string): string[][] {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // strip BOM
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } // escaped quote
        else inQuotes = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field); field = '';
    } else if (c === '\n' || c === '\r') {
      // End the row on \n or \r; swallow the \n of a \r\n pair.
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((v) => v !== '')) rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  // Flush trailing field/row (file with no final newline).
  if (field !== '' || row.length > 0) {
    row.push(field);
    if (row.some((v) => v !== '')) rows.push(row);
  }
  return rows;
}

/** Mask an identifier for error messages so raw NINs never land in logs/UI. */
function maskId(id: string): string {
  if (id.length <= 4) return '••••';
  return `${'•'.repeat(id.length - 4)}${id.slice(-4)}`;
}

/** Coerce any JSON value to a trimmed string, or undefined if empty/nullish. */
function str(v: any): string | undefined {
  if (v === null || v === undefined) return undefined;
  const s = String(v).trim();
  return s === '' ? undefined : s;
}

/** Normalised declaration row shared by the CSV and JSON import paths. */
interface ImportRow {
  lineNo: number;
  nin?: string;
  rc?: string;
  year?: string;
  assessableIncome?: string;
  source?: string;
  notes?: string;
}
