import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/services/audit.service';
import { CryptoService } from '../../common/services/crypto.service';
import { PiiAccessService } from '../../common/services/pii-access.service';
import {
  DEFAULT_SCHEMAS,
  parseCsvText,
  validateRow,
  parsePeriod,
  toDecimal,
  toInt,
  extractBvn,
  SchemaTemplate,
} from './submission-parser';
import { validateIngestionRow, isValidBvnModulo11 } from './ingestion-validators';
import { createHash } from 'crypto';

@Injectable()
export class SubmissionsService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private crypto: CryptoService,
    private pii: PiiAccessService,
  ) {}

  /** Decrypt the PII columns on a data record for display, masking unless allowed. */
  private decryptRecord<T extends { accountNumber?: string | null; bvn?: string | null; nin?: string | null }>(r: T, allowClear: boolean): T {
    if (!r) return r;
    return {
      ...r,
      accountNumber: this.pii.reveal(this.crypto.decrypt(r.accountNumber), 'account', allowClear),
      bvn: this.pii.reveal(this.crypto.decrypt(r.bvn), 'bvn', allowClear),
      nin: this.pii.reveal(this.crypto.decrypt(r.nin), 'nin', allowClear),
    } as T;
  }

  /**
   * Upload + parse a submission file.
   * Used by both staff (uploadedByStaff) and provider portal.
   */
  async upload(opts: {
    providerId: string;
    fileName: string;
    fileBuffer: Buffer;
    periodLabel: string;
    periodYear?: number;
    periodQuarter?: number;
    periodMonth?: number;
    submittedByStaffId?: string;
    submittedByUserId?: string;
    checksum?: string; // optional SHA-256 of the file body (§6.4)
  }) {
    const provider = await this.prisma.dataProvider.findUnique({ where: { id: opts.providerId } });
    if (!provider) throw new NotFoundException('Provider not found');

    // §6.4 checksum verification — reject the whole submission on mismatch.
    if (opts.checksum) {
      const actual = createHash('sha256').update(opts.fileBuffer).digest('hex');
      const given = opts.checksum.replace(/^sha256[-:]/i, '').toLowerCase();
      if (actual !== given) {
        throw new BadRequestException(`Checksum mismatch — expected ${given}, computed ${actual}`);
      }
    }

    const periodInfo = parsePeriod(opts.periodLabel);
    if (!periodInfo) throw new BadRequestException('Invalid periodLabel — use YYYY, YYYY-Qn, or YYYY-MM');

    const submission = await this.prisma.dataSubmission.create({
      data: {
        providerId: opts.providerId,
        submittedByStaffId: opts.submittedByStaffId,
        submittedByUserId: opts.submittedByUserId,
        periodLabel: opts.periodLabel,
        periodYear: opts.periodYear ?? periodInfo.year,
        periodQuarter: opts.periodQuarter ?? periodInfo.quarter ?? null,
        periodMonth: opts.periodMonth ?? periodInfo.month ?? null,
        fileName: opts.fileName,
        fileSizeBytes: opts.fileBuffer.length,
        status: 'VALIDATING',
      },
    });
    const receiptHash = await this.issueReceipt(submission);

    try {
      const result = await this.processFile(submission.id, opts.fileBuffer, provider.providerType, provider.id, provider.providerCode);
      await this.audit.log({
        actorType: opts.submittedByStaffId ? 'STAFF' : 'PROVIDER_USER',
        actorId: opts.submittedByStaffId || opts.submittedByUserId,
        staffId: opts.submittedByStaffId,
        action: 'UPLOAD_SUBMISSION',
        entity: 'DataSubmission',
        entityId: submission.id,
        afterJson: { records: result.recordCount, accepted: result.acceptedCount, rejected: result.rejectedCount, receiptHash },
      });
      return this.findOne(submission.id);
    } catch (err: any) {
      await this.prisma.dataSubmission.update({
        where: { id: submission.id },
        data: {
          status: 'REJECTED',
          validationErrors: { fatal: err.message },
          processedAt: new Date(),
        },
      });
      throw err;
    }
  }

  /**
   * §6.3 JSON REST ingestion. Banks electing the REST channel POST a body with
   * { bankCode, periodQuarter, recordCount, checksum, records[] }. Records run
   * through the same pipeline as CSV. (Client-side field encryption + HSM-side
   * decryption is the transport/HSM workstream; here records carry plain values.)
   */
  async ingestJson(opts: {
    providerId: string;
    periodQuarter: string;
    records: Record<string, any>[];
    checksum?: string;
    submittedByStaffId?: string;
    submittedByUserId?: string;
  }) {
    const provider = await this.prisma.dataProvider.findUnique({ where: { id: opts.providerId } });
    if (!provider) throw new NotFoundException('Provider not found');
    if (!Array.isArray(opts.records) || opts.records.length === 0) {
      throw new BadRequestException('records[] is required');
    }
    const periodInfo = parsePeriod(opts.periodQuarter);
    if (!periodInfo) throw new BadRequestException('Invalid periodQuarter — use YYYY, YYYY-Qn, or YYYY-MM');

    // §6.4 checksum over the canonical records payload.
    if (opts.checksum) {
      const actual = createHash('sha256').update(JSON.stringify(opts.records)).digest('hex');
      const given = opts.checksum.replace(/^sha256[-:]/i, '').toLowerCase();
      if (actual !== given) throw new BadRequestException(`Checksum mismatch — expected ${given}, computed ${actual}`);
    }

    // Coerce values to strings so the shared validators/parsers behave as for CSV,
    // and stamp the submission-level period onto each record if it lacks one.
    const rows = opts.records.map((rec) => {
      const r: Record<string, any> = {};
      for (const [k, v] of Object.entries(rec)) r[k] = v == null ? '' : String(v);
      if (!r.periodLabel && !r.periodQuarter) r.periodLabel = opts.periodQuarter;
      return r;
    });

    const submission = await this.prisma.dataSubmission.create({
      data: {
        providerId: opts.providerId,
        submittedByStaffId: opts.submittedByStaffId,
        submittedByUserId: opts.submittedByUserId,
        periodLabel: opts.periodQuarter,
        periodYear: periodInfo.year,
        periodQuarter: periodInfo.quarter ?? null,
        periodMonth: periodInfo.month ?? null,
        fileName: `json-${opts.periodQuarter}.json`,
        fileSizeBytes: JSON.stringify(opts.records).length,
        status: 'VALIDATING',
      },
    });
    await this.issueReceipt(submission);
    try {
      const result = await this.processRows(submission.id, rows, provider.providerType, provider.id, provider.providerCode, 1);
      await this.audit.log({
        actorType: opts.submittedByStaffId ? 'STAFF' : 'PROVIDER_USER',
        actorId: opts.submittedByStaffId || opts.submittedByUserId,
        staffId: opts.submittedByStaffId,
        action: 'INGEST_JSON', entity: 'DataSubmission', entityId: submission.id,
        afterJson: { records: result.recordCount, accepted: result.acceptedCount, rejected: result.rejectedCount },
      });
      return this.findOne(submission.id);
    } catch (err: any) {
      await this.prisma.dataSubmission.update({
        where: { id: submission.id },
        data: { status: 'REJECTED', validationErrors: { fatal: err.message }, processedAt: new Date() },
      });
      throw err;
    }
  }

  // ─── LARGE-FILE SPLIT UPLOAD (§6.4) ─────────────────────────────────────────

  /** Start a multipart upload session for a large file split into ordered parts. */
  async initMultipart(opts: {
    providerId: string;
    fileName: string;
    periodLabel: string;
    totalParts: number;
    expectedChecksum?: string;
    submittedByStaffId?: string;
    submittedByUserId?: string;
  }) {
    const provider = await this.prisma.dataProvider.findUnique({ where: { id: opts.providerId } });
    if (!provider) throw new NotFoundException('Provider not found');
    const periodInfo = parsePeriod(opts.periodLabel);
    if (!periodInfo) throw new BadRequestException('Invalid periodLabel — use YYYY, YYYY-Qn, or YYYY-MM');
    if (!opts.totalParts || opts.totalParts < 1 || opts.totalParts > 10000) {
      throw new BadRequestException('totalParts must be between 1 and 10000');
    }
    const upload = await this.prisma.submissionUpload.create({
      data: {
        providerId: opts.providerId,
        fileName: opts.fileName,
        periodLabel: opts.periodLabel,
        periodYear: periodInfo.year,
        periodQuarter: periodInfo.quarter ?? null,
        periodMonth: periodInfo.month ?? null,
        totalParts: opts.totalParts,
        expectedChecksum: opts.expectedChecksum?.replace(/^sha256[-:]/i, '').toLowerCase() ?? null,
        submittedByStaffId: opts.submittedByStaffId,
        submittedByUserId: opts.submittedByUserId,
        status: 'OPEN',
      },
    });
    await this.audit.log({
      actorType: opts.submittedByStaffId ? 'STAFF' : 'PROVIDER_USER',
      actorId: opts.submittedByStaffId || opts.submittedByUserId, staffId: opts.submittedByStaffId,
      action: 'MULTIPART_INIT', entity: 'SubmissionUpload', entityId: upload.id,
      afterJson: { fileName: opts.fileName, totalParts: opts.totalParts },
    });
    return { uploadId: upload.id, totalParts: upload.totalParts, receivedParts: 0 };
  }

  /** Receive one part of a multipart upload. Idempotent per (uploadId, partNumber). */
  async uploadPart(uploadId: string, partNumber: number, buffer: Buffer, checksum?: string) {
    const upload = await this.prisma.submissionUpload.findUnique({ where: { id: uploadId } });
    if (!upload) throw new NotFoundException('Upload session not found');
    if (upload.status !== 'OPEN') throw new BadRequestException(`Upload session is ${upload.status}`);
    if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > upload.totalParts) {
      throw new BadRequestException(`partNumber must be between 1 and ${upload.totalParts}`);
    }
    if (!buffer?.length) throw new BadRequestException('Empty part');

    // Verify the per-part checksum if supplied.
    if (checksum) {
      const actual = createHash('sha256').update(buffer).digest('hex');
      const given = checksum.replace(/^sha256[-:]/i, '').toLowerCase();
      if (actual !== given) throw new BadRequestException(`Part ${partNumber} checksum mismatch`);
    }

    // Store as a plain Uint8Array (Prisma Bytes) — copy off any SharedArrayBuffer
    // backing so the type is a standard ArrayBuffer-backed view.
    const data = Uint8Array.from(buffer);
    // Upsert so a retried part overwrites rather than duplicates.
    await this.prisma.submissionUploadPart.upsert({
      where: { uploadId_partNumber: { uploadId, partNumber } },
      create: { uploadId, partNumber, sizeBytes: buffer.length, checksum: checksum ?? null, data },
      update: { sizeBytes: buffer.length, checksum: checksum ?? null, data },
    });

    const received = await this.prisma.submissionUploadPart.count({ where: { uploadId } });
    return { uploadId, partNumber, receivedParts: received, totalParts: upload.totalParts };
  }

  /**
   * Complete a multipart upload: verify all parts are present, reassemble them in
   * order, verify the whole-file checksum, then run the reassembled CSV through
   * the normal ingestion pipeline. Parts are deleted afterwards to reclaim space.
   */
  async completeMultipart(uploadId: string) {
    const upload = await this.prisma.submissionUpload.findUnique({
      where: { id: uploadId },
      include: { provider: true },
    });
    if (!upload) throw new NotFoundException('Upload session not found');
    if (upload.status !== 'OPEN') throw new BadRequestException(`Upload session is already ${upload.status}`);

    const parts = await this.prisma.submissionUploadPart.findMany({
      where: { uploadId }, orderBy: { partNumber: 'asc' }, select: { partNumber: true, data: true, sizeBytes: true },
    });
    if (parts.length !== upload.totalParts) {
      const have = new Set(parts.map((p) => p.partNumber));
      const missing = Array.from({ length: upload.totalParts }, (_, i) => i + 1).filter((n) => !have.has(n));
      throw new BadRequestException(`Missing part(s): ${missing.slice(0, 20).join(', ')}${missing.length > 20 ? '…' : ''}`);
    }

    // Reassemble in order.
    const full = Buffer.concat(parts.map((p) => Buffer.from(p.data)));

    // §6.4 whole-file integrity check.
    if (upload.expectedChecksum) {
      const actual = createHash('sha256').update(full).digest('hex');
      if (actual !== upload.expectedChecksum) {
        await this.prisma.submissionUpload.update({ where: { id: uploadId }, data: { status: 'ABORTED' } });
        throw new BadRequestException(`Reassembled file checksum mismatch — expected ${upload.expectedChecksum}, computed ${actual}`);
      }
    }

    // Feed the reassembled buffer through the standard upload path (checksum
    // already verified above, so pass it through as the file body).
    const submission = await this.upload({
      providerId: upload.providerId,
      fileName: upload.fileName,
      fileBuffer: full,
      periodLabel: upload.periodLabel,
      periodYear: upload.periodYear ?? undefined,
      periodQuarter: upload.periodQuarter ?? undefined,
      periodMonth: upload.periodMonth ?? undefined,
      submittedByStaffId: upload.submittedByStaffId ?? undefined,
      submittedByUserId: upload.submittedByUserId ?? undefined,
    });

    // Mark session completed and reclaim part storage.
    await this.prisma.submissionUpload.update({
      where: { id: uploadId },
      data: { status: 'COMPLETED', totalBytes: full.length, submissionId: (submission as any).id },
    });
    await this.prisma.submissionUploadPart.deleteMany({ where: { uploadId } });

    await this.audit.log({
      actorType: upload.submittedByStaffId ? 'STAFF' : 'PROVIDER_USER',
      actorId: upload.submittedByStaffId || upload.submittedByUserId, staffId: upload.submittedByStaffId,
      action: 'MULTIPART_COMPLETE', entity: 'SubmissionUpload', entityId: uploadId,
      afterJson: { totalBytes: full.length, submissionId: (submission as any).id },
    });

    return submission;
  }

  /** Abort an in-progress multipart upload and drop its parts. */
  async abortMultipart(uploadId: string) {
    const upload = await this.prisma.submissionUpload.findUnique({ where: { id: uploadId } });
    if (!upload) throw new NotFoundException('Upload session not found');
    await this.prisma.submissionUploadPart.deleteMany({ where: { uploadId } });
    await this.prisma.submissionUpload.update({ where: { id: uploadId }, data: { status: 'ABORTED' } });
    return { uploadId, status: 'ABORTED' };
  }

  private async processFile(submissionId: string, buffer: Buffer, providerType: string, providerId: string, providerCode?: string) {
    const csvText = buffer.toString('utf8');
    const { rows } = parseCsvText(csvText);
    if (rows.length === 0) {
      throw new BadRequestException('No data rows in file');
    }
    return this.processRows(submissionId, rows, providerType, providerId, providerCode, 2);
  }

  /**
   * Shared ingestion pipeline for CSV rows and JSON records. Applies §6.2 field
   * aliasing (periodQuarter→periodLabel, totalCreditTransactions→transactionCount;
   * accountType/accountOpenedDate/residentialState/reportingBranch/debit counts
   * captured into payload), then the §6.4 integrity + duplicate gates, encryption,
   * and entity resolution.
   */
  private async processRows(
    submissionId: string,
    rawRows: Record<string, any>[],
    providerType: string,
    providerId: string,
    providerCode?: string,
    rowOffset = 1,
  ) {
    const rows = rawRows;
    // Pick schema: stored ProviderSchema for this type if present, else default
    const stored = await this.prisma.providerSchema.findUnique({ where: { providerType: providerType as any } });
    const schema: SchemaTemplate = stored
      ? { providerType, columns: (stored.columns as any) || DEFAULT_SCHEMAS[providerType].columns }
      : DEFAULT_SCHEMAS[providerType] || DEFAULT_SCHEMAS.OTHER;

    let accepted = 0, rejected = 0;
    const errors: { row: number; messages: string[] }[] = [];
    // Records are flushed to the DB in bounded batches as we go, so memory stays
    // flat regardless of file size (large-file safe). recordCreates is the
    // pending batch, not the whole file.
    const BATCH = 500;
    let recordCreates: Prisma.DataRecordCreateManyInput[] = [];
    const flush = async () => {
      if (recordCreates.length === 0) return;
      await this.prisma.dataRecord.createMany({ data: recordCreates });
      recordCreates = [];
    };

    // §6.4 duplicate detection: build the set of (period::account) already on
    // file for this provider, plus track within-file dupes. Account numbers are
    // encrypted, so we key on the HMAC blind index.
    const existing = await this.prisma.dataRecord.findMany({
      where: { providerId, accountIndex: { not: null } },
      select: { periodLabel: true, accountIndex: true },
    });
    const seenKeys = new Set(existing.map((r) => `${r.periodLabel}::${r.accountIndex}`));
    const enforceBvnCheckDigit = process.env.BVN_CHECKDIGIT_ENFORCED === 'true';

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      // §6.2 field aliasing → canonical names used downstream.
      if (!row.periodLabel && row.periodQuarter) row.periodLabel = row.periodQuarter;
      if ((row.transactionCount == null || row.transactionCount === '') && row.totalCreditTransactions != null) {
        row.transactionCount = row.totalCreditTransactions;
      }
      const rn = i + rowOffset;

      const { ok, errors: errs } = validateRow(row, schema);
      if (!ok) {
        rejected++;
        if (errors.length < 100) errors.push({ row: rn, messages: errs });
        continue;
      }

      const periodInfo = parsePeriod(row.periodLabel);
      if (!periodInfo) {
        rejected++;
        if (errors.length < 100) errors.push({ row: rn, messages: ['Invalid periodLabel'] });
        continue;
      }

      // Integrity gate: completeness, BVN format, NUBAN check digit, arithmetic
      const integrityErrors = validateIngestionRow(row as any, providerType, row.bankCode || providerCode);
      if (enforceBvnCheckDigit && row.bvn && !isValidBvnModulo11(row.bvn)) {
        integrityErrors.push('BVN fails modulo-11 check digit');
      }
      if (integrityErrors.length) {
        rejected++;
        if (errors.length < 100) errors.push({ row: rn, messages: integrityErrors });
        continue;
      }

      // §6.4 duplicate detection: same provider + account + period.
      const accountIndex = this.crypto.blindIndex(row.accountNumber || null);
      if (accountIndex) {
        const dupKey = `${row.periodLabel}::${accountIndex}`;
        if (seenKeys.has(dupKey)) {
          rejected++;
          if (errors.length < 100) errors.push({ row: rn, messages: ['Duplicate: this account + period was already submitted'] });
          continue;
        }
        seenKeys.add(dupKey);
      }

      // Taxpayer matching (entity resolution) — see resolveTaxpayer()
      const bvn = extractBvn(row.bvn);
      const nin = row.nin || null;
      const match = await this.resolveTaxpayer({
        nin,
        tin: row.tin || null,
        bvn,
        accountName: row.accountName || null,
      });
      const taxpayerId = match.taxpayerId;

      // payload assembly (provider-specific)
      const payload: any = {};
      if (providerType === 'TELCO') {
        if (row.airtimeSpend) payload.airtimeSpend = Number(row.airtimeSpend);
        if (row.dataSpend) payload.dataSpend = Number(row.dataSpend);
      }
      if (providerType === 'BANK') {
        if (row.bankCode) payload.bankCode = row.bankCode;
        if (row.bankName) payload.bankName = row.bankName;
      }
      // §6.2 extended columns captured into payload (no dedicated DataRecord cols).
      for (const k of ['accountType', 'accountOpenedDate', 'residentialState', 'reportingBranch', 'totalDebitTransactions'] as const) {
        if (row[k] != null && row[k] !== '') payload[k] = row[k];
      }

      // Provider-supplied sector / business type. When present, persist to the
      // matched taxpayer (provider-supplied is authoritative over later inference).
      const providedSector = (row.sector || '').trim().toUpperCase().replace(/\s+/g, '_') || null;
      const providedBusinessType = (row.businessType || '').trim() || null;
      if (payload && (providedSector || providedBusinessType)) {
        if (providedSector) payload.sector = providedSector;
        if (providedBusinessType) payload.businessType = providedBusinessType;
      }
      if (taxpayerId && (providedSector || providedBusinessType)) {
        await this.prisma.taxpayer.update({
          where: { id: taxpayerId },
          data: {
            ...(providedSector ? { sector: providedSector } : {}),
            ...(providedBusinessType ? { businessType: providedBusinessType } : {}),
          },
        }).catch(() => { /* non-fatal — taxpayer may have been removed mid-batch */ });
      }

      recordCreates.push({
        submissionId,
        providerId,
        providerType: providerType as any,
        taxpayerId,
        // PII encrypted at rest (AES-256-GCM)
        accountNumber: this.crypto.encrypt(row.accountNumber || null),
        bvn: this.crypto.encrypt(bvn),
        nin: this.crypto.encrypt(nin),
        phoneNumber: this.crypto.encrypt(row.phoneNumber || null),
        walletId: row.walletId || null,
        merchantId: row.merchantId || null,
        accountName: row.accountName || null,
        matchMethod: match.method,
        matchConfidence: match.confidence != null ? new Prisma.Decimal(match.confidence) : null,
        accountIndex,
        periodLabel: row.periodLabel,
        periodYear: periodInfo.year,
        totalInflow: toDecimal(row.totalInflow),
        totalOutflow: toDecimal(row.totalOutflow),
        openingBalance: toDecimal(row.openingBalance),
        closingBalance: toDecimal(row.closingBalance),
        transactionCount: toInt(row.transactionCount),
        payload: Object.keys(payload).length ? payload : Prisma.DbNull,
        reviewStatus: null,
      });
      accepted++;
      if (recordCreates.length >= BATCH) await flush();
    }

    await flush();

    const status =
      rejected === 0 && accepted > 0 ? 'ACCEPTED' :
      accepted > 0 ? 'PARTIALLY_ACCEPTED' : 'REJECTED';

    await this.prisma.dataSubmission.update({
      where: { id: submissionId },
      data: {
        recordCount: rows.length,
        acceptedCount: accepted,
        rejectedCount: rejected,
        validationErrors: errors.length ? (errors as any) : Prisma.DbNull,
        status: status as any,
        // §6.5: a rejected / partially-accepted file must be resubmitted within 5 business days.
        resubmitDueAt: status === 'ACCEPTED' ? null : addBusinessDays(new Date(), 5),
        processedAt: new Date(),
      },
    });

    return { recordCount: rows.length, acceptedCount: accepted, rejectedCount: rejected };
  }

  /** Issue the §6.5 acknowledgment receipt hash for a freshly-received submission. */
  private async issueReceipt(s: { id: string; providerId: string; receivedAt: Date; fileSizeBytes: number | null }): Promise<string> {
    const receiptHash = createHash('sha256')
      .update(`${s.id}|${s.providerId}|${s.receivedAt.toISOString()}|${s.fileSizeBytes ?? 0}`)
      .digest('hex');
    await this.prisma.dataSubmission.update({ where: { id: s.id }, data: { receiptHash } });
    return receiptHash;
  }

  /** §6.5 bank-facing validation report for a submission. */
  async report(id: string) {
    const s = await this.prisma.dataSubmission.findUnique({
      where: { id },
      select: {
        id: true, providerId: true, periodLabel: true, fileName: true, receiptHash: true,
        status: true, recordCount: true, acceptedCount: true, rejectedCount: true,
        validationErrors: true, receivedAt: true, processedAt: true, resubmitDueAt: true,
      },
    });
    if (!s) throw new NotFoundException('Submission not found');
    return {
      submissionId: s.id,
      receiptHash: s.receiptHash,
      acknowledgedAt: s.receivedAt,
      status: s.status,
      summary: { total: s.recordCount, accepted: s.acceptedCount, rejected: s.rejectedCount },
      errors: s.validationErrors ?? [],
      processedAt: s.processedAt,
      resubmitDueAt: s.resubmitDueAt,
    };
  }

  async findAll(query: any) {
    const page = Math.max(1, parseInt(query.page || '1', 10));
    const limit = Math.min(200, Math.max(1, parseInt(query.limit || '50', 10)));
    const where: Prisma.DataSubmissionWhereInput = {
      ...(query.providerId ? { providerId: query.providerId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.periodYear ? { periodYear: parseInt(query.periodYear, 10) } : {}),
    };
    const [submissions, total] = await Promise.all([
      this.prisma.dataSubmission.findMany({
        where,
        include: {
          provider: { select: { id: true, name: true, providerType: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.dataSubmission.count({ where }),
    ]);
    return { submissions, total, page, limit };
  }

  async findOne(id: string) {
    const submission = await this.prisma.dataSubmission.findUnique({
      where: { id },
      include: {
        provider: { select: { id: true, name: true, providerType: true } },
        submittedByUser: { select: { id: true, firstName: true, lastName: true, email: true } },
        records: {
          take: 50,
          orderBy: { createdAt: 'desc' },
          include: { taxpayer: { select: { id: true, ninEnc: true, businessName: true, firstName: true, lastName: true } } },
        },
      },
    });
    if (!submission) throw new NotFoundException('Submission not found');
    // Decrypt PII on the returned records and their linked taxpayers (masked unless allowed).
    const clear = await this.pii.canRevealPii();
    return {
      ...submission,
      records: submission.records.map((r) => ({
        ...this.decryptRecord(r, clear),
        taxpayer: r.taxpayer ? { ...r.taxpayer, nin: this.pii.reveal(this.crypto.decrypt(r.taxpayer.ninEnc), 'nin', clear) } : r.taxpayer,
      })),
    };
  }

  async reprocess(id: string) {
    const sub = await this.prisma.dataSubmission.findUnique({ where: { id }, include: { provider: true } });
    if (!sub) throw new NotFoundException('Submission not found');
    // Re-run entity resolution on still-unmatched records (no file re-read).
    const records = await this.prisma.dataRecord.findMany({ where: { submissionId: id, taxpayerId: null } });
    let matched = 0;
    for (const r of records) {
      const match = await this.resolveTaxpayer({
        nin: this.crypto.decrypt(r.nin),
        tin: null,
        bvn: this.crypto.decrypt(r.bvn),
        accountName: r.accountName,
      });
      if (match.taxpayerId) {
        await this.prisma.dataRecord.update({
          where: { id: r.id },
          data: {
            taxpayerId: match.taxpayerId,
            matchMethod: match.method,
            matchConfidence: match.confidence != null ? new Prisma.Decimal(match.confidence) : null,
          },
        });
        matched++;
      }
    }
    return { reprocessed: records.length, matched };
  }

  /**
   * Resolve a data row to a registered taxpayer.
   * Strong identifiers (NIN, TIN, BVN) win and carry high confidence; a
   * normalized-name fallback is allowed but flagged as low confidence so the
   * detection engine and officers know to verify it. The match method and
   * confidence are persisted on the record for auditability.
   */
  private async resolveTaxpayer(opts: {
    nin?: string | null;
    tin?: string | null;
    bvn?: string | null;
    accountName?: string | null;
  }): Promise<{ taxpayerId: string | null; method: string; confidence: number | null }> {
    // Identifiers are matched via their blind index (the plaintext is encrypted).
    if (opts.nin) {
      const t = await this.prisma.taxpayer.findUnique({ where: { ninIndex: this.crypto.blindIndex(opts.nin)! }, select: { id: true } });
      if (t) return { taxpayerId: t.id, method: 'NIN', confidence: 0.98 };
    }
    if (opts.tin) {
      const t = await this.prisma.taxpayer.findUnique({ where: { tinIndex: this.crypto.blindIndex(opts.tin)! }, select: { id: true } });
      if (t) return { taxpayerId: t.id, method: 'TIN', confidence: 0.97 };
    }
    if (opts.bvn) {
      const t = await this.prisma.taxpayer.findUnique({ where: { bvnIndex: this.crypto.blindIndex(opts.bvn)! }, select: { id: true } });
      if (t) return { taxpayerId: t.id, method: 'BVN', confidence: 0.95 };
    }
    if (opts.accountName) {
      const name = normalizeName(opts.accountName);
      if (name) {
        // Match a corporate business name, or an individual's "first last" pair.
        const parts = name.split(' ').filter(Boolean);
        const t = await this.prisma.taxpayer.findFirst({
          where: {
            OR: [
              { businessName: { equals: name, mode: 'insensitive' as any } },
              ...(parts.length >= 2
                ? [
                    {
                      AND: [
                        { firstName: { equals: parts[0], mode: 'insensitive' as any } },
                        { lastName: { equals: parts[parts.length - 1], mode: 'insensitive' as any } },
                      ],
                    },
                  ]
                : []),
            ],
          },
          select: { id: true },
        });
        if (t) return { taxpayerId: t.id, method: 'NAME', confidence: 0.55 };
      }
    }
    return { taxpayerId: null, method: 'UNMATCHED', confidence: null };
  }
}

/** Add N business days (skipping weekends) to a date. */
function addBusinessDays(from: Date, days: number): Date {
  const d = new Date(from);
  let added = 0;
  while (added < days) {
    d.setDate(d.getDate() + 1);
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) added++;
  }
  return d;
}

/** Lowercase, strip honorifics/punctuation, collapse whitespace for matching. */
function normalizeName(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[.,]/g, ' ')
    .replace(/\b(mr|mrs|miss|ms|dr|engr|alhaji|alhaja|chief|prof|barr|sir|madam)\b/g, ' ')
    .replace(/\b(ltd|limited|plc|enterprises|enterprise|nig|nigeria|co)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
