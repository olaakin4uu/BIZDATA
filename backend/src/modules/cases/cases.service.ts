import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, CaseStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/services/audit.service';
import { CryptoService } from '../../common/services/crypto.service';
import { PiiAccessService } from '../../common/services/pii-access.service';
import { extractFinancials, reconcile, scoreReconciliation } from '../agents/implementations/document-intelligence.agent';

// Statutory windows / rates. CONFIRM against the gazetted NTAA/NTA text — kept
// as named constants so they can move to tenant config.
const OBJECTION_WINDOW_DAYS = 30;          // §41: taxpayer's window to object
const AUTHORITY_RESPONSE_DAYS = 90;        // §41(6): authority must respond, else deemed upheld
const LATE_PAYMENT_PENALTY_RATE = 0.1;     // 10% late-payment penalty on assessed tax

// States in which the estimated tax is still considered "at risk" / recoverable.
const ACTIVE_STATES: CaseStatus[] = [
  'OPEN',
  'UNDER_REVIEW',
  'NOTICE_ISSUED',
  'OBJECTION',
  'CONFIRMED',
  'SETTLED',
];

// Allowed lifecycle transitions (state machine).
const TRANSITIONS: Record<CaseStatus, CaseStatus[]> = {
  OPEN: ['UNDER_REVIEW', 'DISMISSED'],
  UNDER_REVIEW: ['NOTICE_ISSUED', 'DISMISSED'],
  NOTICE_ISSUED: ['OBJECTION', 'CONFIRMED'],
  OBJECTION: ['CONFIRMED', 'DISMISSED'],
  CONFIRMED: ['SETTLED', 'RECOVERED'],
  SETTLED: ['RECOVERED', 'CLOSED'],
  RECOVERED: ['CLOSED'],
  DISMISSED: ['CLOSED'],
  CLOSED: [],
};

@Injectable()
export class CasesService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private crypto: CryptoService,
    private pii: PiiAccessService,
  ) {}

  /** Dashboard headline metrics, the detection→recovery funnel, and breakdowns. */
  async stats(query: { year?: string } = {}) {
    const where: Prisma.UnderdeclarationCaseWhereInput = {
      ...(query.year ? { year: parseInt(query.year, 10) } : {}),
    };

    const [byStatus, byRisk, atRiskAgg, recoveredAgg, totalEstAgg, totalCount] = await Promise.all([
      this.prisma.underdeclarationCase.groupBy({ by: ['status'], where, _count: true, _sum: { estimatedTaxDue: true } }),
      this.prisma.underdeclarationCase.groupBy({ by: ['riskLevel'], where, _count: true }),
      this.prisma.underdeclarationCase.aggregate({
        where: { ...where, status: { in: ACTIVE_STATES } },
        _sum: { estimatedTaxDue: true },
      }),
      this.prisma.underdeclarationCase.aggregate({
        where: { ...where, status: { in: ['RECOVERED', 'SETTLED'] } },
        _sum: { recoveredAmount: true },
      }),
      this.prisma.underdeclarationCase.aggregate({ where, _sum: { estimatedTaxDue: true } }),
      this.prisma.underdeclarationCase.count({ where }),
    ]);

    const statusCount = (s: CaseStatus) =>
      byStatus.find((r) => r.status === s)?._count ?? 0;

    // Funnel: each stage counts cases at-or-beyond that stage where sensible.
    const funnel = [
      { stage: 'Detected', count: totalCount },
      { stage: 'Under review', count: statusCount('UNDER_REVIEW') },
      { stage: 'Notice issued', count: statusCount('NOTICE_ISSUED') },
      { stage: 'Objection', count: statusCount('OBJECTION') },
      { stage: 'Confirmed', count: statusCount('CONFIRMED') },
      { stage: 'Settled', count: statusCount('SETTLED') },
      { stage: 'Recovered', count: statusCount('RECOVERED') },
    ];

    return {
      totalCases: totalCount,
      openCases: statusCount('OPEN'),
      dismissedCases: statusCount('DISMISSED'),
      revenueAtRisk: Number(atRiskAgg._sum.estimatedTaxDue ?? 0),
      recovered: Number(recoveredAgg._sum.recoveredAmount ?? 0),
      estimatedTaxTotal: Number(totalEstAgg._sum.estimatedTaxDue ?? 0),
      funnel,
      byStatus: byStatus.map((r) => ({ status: r.status, count: r._count, estimatedTax: Number(r._sum.estimatedTaxDue ?? 0) })),
      byRisk: byRisk.map((r) => ({ riskLevel: r.riskLevel, count: r._count })),
    };
  }

  async findAll(query: any) {
    const page = Math.max(1, parseInt(query.page || '1', 10));
    const limit = Math.min(200, Math.max(1, parseInt(query.limit || '50', 10)));
    const where: Prisma.UnderdeclarationCaseWhereInput = {
      ...(query.year ? { year: parseInt(query.year, 10) } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.riskLevel ? { riskLevel: query.riskLevel } : {}),
      ...(query.assignedToId ? { assignedToId: query.assignedToId } : {}),
    };
    const orderBy: Prisma.UnderdeclarationCaseOrderByWithRelationInput =
      query.sort === 'confidence' ? { confidence: 'desc' } : { estimatedTaxDue: 'desc' };

    const [cases, total] = await Promise.all([
      this.prisma.underdeclarationCase.findMany({
        where,
        include: {
          taxpayer: { select: { id: true, type: true, firstName: true, lastName: true, businessName: true, tinEnc: true, stateOfResidence: true } },
          assignedTo: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.underdeclarationCase.count({ where }),
    ]);
    const decrypted = cases.map((c) => ({
      ...c,
      taxpayer: c.taxpayer ? { ...c.taxpayer, tin: this.crypto.decrypt(c.taxpayer.tinEnc) } : c.taxpayer,
    }));
    return { cases: decrypted, total, page, limit };
  }

  async findOne(id: string) {
    const c = await this.prisma.underdeclarationCase.findUnique({
      where: { id },
      include: {
        taxpayer: true,
        assignedTo: { select: { id: true, firstName: true, lastName: true } },
        scan: { select: { id: true, startedAt: true, threshold: true, engineVersion: true } },
      },
    });
    if (!c) throw new NotFoundException('Case not found');
    const clear = await this.pii.canRevealPii();
    return {
      ...c,
      taxpayer: c.taxpayer
        ? {
            ...c.taxpayer,
            nin: this.pii.reveal(this.crypto.decrypt(c.taxpayer.ninEnc), 'nin', clear),
            bvn: this.pii.reveal(this.crypto.decrypt(c.taxpayer.bvnEnc), 'bvn', clear),
            tin: this.crypto.decrypt(c.taxpayer.tinEnc),
          }
        : c.taxpayer,
    };
  }

  /**
   * Build a defensible, printable (HTML→PDF) evidence bundle for a case and log
   * the export to the tamper-evident audit chain (chain of custody). PII is
   * masked unless the viewer is authorised.
   */
  async evidenceBundle(id: string, staff: { id: string; email?: string }) {
    const c = await this.prisma.underdeclarationCase.findUnique({
      where: { id },
      include: { taxpayer: true, scan: { select: { engineVersion: true, threshold: true, startedAt: true } } },
    });
    if (!c) throw new NotFoundException('Case not found');

    const clear = await this.pii.canRevealPii();
    const tp = c.taxpayer;
    const name = tp.businessName || [tp.firstName, tp.lastName].filter(Boolean).join(' ') || 'Unknown';
    const tin = this.crypto.decrypt(tp.tinEnc);
    const bvn = this.pii.reveal(this.crypto.decrypt(tp.bvnEnc), 'bvn', clear);
    const nin = this.pii.reveal(this.crypto.decrypt(tp.ninEnc), 'nin', clear);

    const records = await this.prisma.dataRecord.findMany({
      where: { taxpayerId: c.taxpayerId, periodYear: c.year },
      include: { provider: { select: { name: true } } },
      orderBy: { totalInflow: 'desc' },
    });
    const signals = await this.prisma.riskSignal.findMany({ where: { taxpayerId: c.taxpayerId, year: c.year } });
    const reasons = (c.reasons as any[]) ?? [];

    // Chain of custody: record the export, then anchor on the resulting hash.
    await this.audit.log({
      actorType: 'STAFF', actorId: staff.id, staffId: staff.id,
      action: 'EVIDENCE_EXPORT', entity: 'UnderdeclarationCase', entityId: id,
      afterJson: { exportedBy: staff.email, demandNoticeRef: c.demandNoticeRef },
    });
    const anchor = await this.prisma.auditLog.findFirst({ orderBy: { createdAt: 'desc' }, select: { hashChainCurr: true } });

    const ngn = (v: any) => '₦' + Number(v ?? 0).toLocaleString();
    const esc = (s: any) => String(s ?? '').replace(/[<>&]/g, (ch) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[ch]!));
    const now = new Date();
    const watermark = `${staff.email ?? staff.id} · ${now.toISOString()}`;

    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Evidence Bundle ${esc(c.demandNoticeRef ?? c.id)}</title>
<style>
 body{font-family:Segoe UI,Arial,sans-serif;color:#1e293b;max-width:820px;margin:24px auto;padding:0 24px;font-size:13px}
 h1{font-size:20px;margin:0} h2{font-size:14px;border-bottom:1px solid #e2e8f0;padding-bottom:4px;margin-top:24px}
 .muted{color:#64748b;font-size:11px} .tag{display:inline-block;background:#fee2e2;color:#991b1b;font-size:10px;padding:2px 8px;border-radius:10px;text-transform:uppercase;letter-spacing:.05em}
 table{width:100%;border-collapse:collapse;margin-top:8px} th,td{text-align:left;padding:6px 8px;border-bottom:1px solid #f1f5f9} th{font-size:10px;text-transform:uppercase;color:#64748b}
 .num{text-align:right} .tot{font-weight:700;color:#991b1b}
 .wm{position:fixed;bottom:8px;right:8px;color:#cbd5e1;font-size:9px} .box{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px;margin-top:8px}
 @media print{.noprint{display:none}}
</style></head><body>
 <div class="tag">Confidential · NTAA 2025 §139</div>
 <h1>Bank Reports Intelligence System — Evidence Bundle</h1>
 <p class="muted">Demand notice ${esc(c.demandNoticeRef ?? '—')} · generated ${esc(now.toISOString())} · by ${esc(staff.email ?? staff.id)}</p>

 <h2>Taxpayer</h2>
 <div class="box">
  <strong>${esc(name)}</strong> (${esc(tp.type)})<br>
  TIN: ${esc(tin ?? '—')} · BVN: ${esc(bvn ?? '—')} · NIN: ${esc(nin ?? '—')}<br>
  State: ${esc(tp.stateOfResidence ?? '—')} · Sector: ${esc(tp.sector ?? '—')} · Tax year: ${c.year}
 </div>

 <h2>Assessment — NTAA 2025 §35 (Best of Judgement)</h2>
 <table>
  <tr><td>Observed income (bank-reported)</td><td class="num">${ngn(c.observedIncome)}</td></tr>
  <tr><td>Declared income</td><td class="num">${ngn(c.declaredIncome)}</td></tr>
  <tr><td>Discrepancy</td><td class="num">${ngn(c.discrepancyAmount)}</td></tr>
  <tr><td>Assessed tax</td><td class="num">${ngn(c.assessedTax)}</td></tr>
  <tr><td>Late-payment penalty (10%)</td><td class="num">${ngn(c.penaltyAmount)}</td></tr>
  <tr><td class="tot">Total demand</td><td class="num tot">${ngn(c.assessedTotal)}</td></tr>
 </table>
 <p class="muted">Detection confidence ${Math.round(Number(c.confidence) * 100)}%${c.agentScore != null ? ` · AI corroboration ${Math.round(Number(c.agentScore) * 100)}%` : ''} · engine ${esc(c.scan?.engineVersion ?? c.engineVersion ?? '—')} · status ${esc(c.status)}.
 Objection due ${c.objectionDueAt ? esc(new Date(c.objectionDueAt).toDateString()) : '—'} (§41); authority response due ${c.authorityResponseDueAt ? esc(new Date(c.authorityResponseDueAt).toDateString()) : '—'} (§41(6)).</p>

 <h2>Basis — why flagged</h2>
 <ul>${reasons.map((r) => `<li>${esc(r.label)} <span class="muted">(${esc(r.code)})</span></li>`).join('') || '<li class="muted">No reason codes.</li>'}</ul>

 <h2>AI analytics signals</h2>
 <table><tr><th>Agent</th><th>Severity</th><th class="num">Score</th><th>Summary</th></tr>
 ${signals.map((s) => `<tr><td>${esc(s.agentKey)}</td><td>${esc(s.severity)}</td><td class="num">${Math.round(Number(s.score) * 100)}%</td><td>${esc(s.summary)}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">No agent signals.</td></tr>'}
 </table>

 <h2>Source records (${records.length})</h2>
 <table><tr><th>Provider</th><th>Period</th><th class="num">Inflow</th><th class="num">Outflow</th><th>Match</th></tr>
 ${records.map((r) => `<tr><td>${esc(r.provider?.name ?? r.providerType)}</td><td>${esc(r.periodLabel)}</td><td class="num">${ngn(r.totalInflow)}</td><td class="num">${ngn(r.totalOutflow)}</td><td>${esc(r.matchMethod ?? '—')}</td></tr>`).join('')}
 </table>

 <h2>Integrity</h2>
 <p class="muted">This bundle and its export are recorded in the tamper-evident, SHA-256 hash-chained audit trail.<br>
 Chain anchor: <code>${esc(anchor?.hashChainCurr ?? 'n/a')}</code></p>

 <p class="muted noprint" style="margin-top:24px">Tip: use your browser's Print → Save as PDF to file this bundle.</p>
 <div class="wm">${esc(watermark)}</div>
</body></html>`;
    return html;
  }

  /** Move a case through its lifecycle, enforcing the allowed-transition map. */
  async transition(id: string, dto: { to: CaseStatus; notes?: string; recoveredAmount?: number }, staffId: string) {
    const current = await this.prisma.underdeclarationCase.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Case not found');

    const allowed = TRANSITIONS[current.status] ?? [];
    if (!allowed.includes(dto.to)) {
      throw new BadRequestException(`Cannot move a ${current.status} case to ${dto.to}. Allowed: ${allowed.join(', ') || 'none'}`);
    }

    const data: Prisma.UnderdeclarationCaseUpdateInput = { status: dto.to };
    if (dto.notes) data.notes = dto.notes;
    if (dto.to === 'NOTICE_ISSUED') {
      const now = new Date();
      data.noticeIssuedAt = now;
      data.objectionDueAt = new Date(now.getTime() + OBJECTION_WINDOW_DAYS * 86_400_000);
      // §35 Best-of-Judgement assessment: tax on the discrepancy + 10% penalty.
      const assessedTax = Number(current.estimatedTaxDue);
      const penalty = assessedTax * LATE_PAYMENT_PENALTY_RATE;
      const total = assessedTax + penalty;
      data.assessedTax = new Prisma.Decimal(assessedTax.toFixed(2));
      data.penaltyAmount = new Prisma.Decimal(penalty.toFixed(2));
      data.assessedTotal = new Prisma.Decimal(total.toFixed(2));
      data.demandNoticeRef = `DN-${current.year}-${id.slice(0, 6).toUpperCase()}`;
      data.assessmentBasis = {
        statute: 'NTAA 2025 s.35 (Best of Judgement)',
        observedIncome: Number(current.observedIncome),
        declaredIncome: Number(current.declaredIncome),
        discrepancy: Number(current.discrepancyAmount),
        assessedTax,
        penaltyRate: LATE_PAYMENT_PENALTY_RATE,
        penalty,
        total,
        objectionWindowDays: OBJECTION_WINDOW_DAYS,
        issuedAt: now.toISOString(),
      } as any;
    }
    if (dto.to === 'OBJECTION') {
      // §41(6): the authority has 90 days to respond or the objection is deemed upheld.
      data.authorityResponseDueAt = new Date(Date.now() + AUTHORITY_RESPONSE_DAYS * 86_400_000);
    }
    if (dto.to === 'RECOVERED') {
      data.recoveredAmount = new Prisma.Decimal((dto.recoveredAmount ?? Number(current.estimatedTaxDue)).toFixed(2));
      data.resolvedAt = new Date();
    }
    if (dto.to === 'SETTLED' && dto.recoveredAmount != null) {
      data.recoveredAmount = new Prisma.Decimal(dto.recoveredAmount.toFixed(2));
    }
    if (dto.to === 'DISMISSED' || dto.to === 'CLOSED') data.resolvedAt = new Date();

    const updated = await this.prisma.underdeclarationCase.update({ where: { id }, data });

    await this.audit.log({
      actorType: 'STAFF',
      actorId: staffId,
      staffId,
      action: 'CASE_TRANSITION',
      entity: 'UnderdeclarationCase',
      entityId: id,
      beforeJson: { status: current.status },
      afterJson: { status: dto.to, notes: dto.notes ?? null },
    });

    return updated;
  }

  async assign(id: string, assignedToId: string | null, staffId: string) {
    const current = await this.prisma.underdeclarationCase.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Case not found');
    const updated = await this.prisma.underdeclarationCase.update({ where: { id }, data: { assignedToId } });
    await this.audit.log({
      actorType: 'STAFF', actorId: staffId, staffId,
      action: 'CASE_ASSIGN', entity: 'UnderdeclarationCase', entityId: id,
      beforeJson: { assignedToId: current.assignedToId }, afterJson: { assignedToId },
    });
    return updated;
  }

  /**
   * §41(6): any case under OBJECTION whose 90-day authority-response window has
   * lapsed is DEEMED UPHELD in the taxpayer's favour and dismissed. Intended to
   * run on a schedule (see scheduled-scans item); also callable on demand.
   */
  async processDeadlines(staffId?: string) {
    const now = new Date();
    const overdue = await this.prisma.underdeclarationCase.findMany({
      where: { status: 'OBJECTION', authorityResponseDueAt: { lt: now } },
      select: { id: true },
    });
    for (const c of overdue) {
      await this.prisma.underdeclarationCase.update({
        where: { id: c.id },
        data: {
          status: 'DISMISSED',
          resolvedAt: now,
          notes: 'Objection deemed upheld — authority did not respond within the §41(6) 90-day window.',
        },
      });
      await this.audit.log({
        actorType: staffId ? 'STAFF' : 'SYSTEM', actorId: staffId, staffId,
        action: 'OBJECTION_DEEMED_UPHELD', entity: 'UnderdeclarationCase', entityId: c.id,
        afterJson: { status: 'DISMISSED', basis: 'NTAA 2025 s.41(6)' },
      });
    }
    return { deemedUpheld: overdue.length };
  }

  // ─── OBJECTION DOCUMENTS + DOCUMENT INTELLIGENCE ──────────────────────────

  /**
   * Turn an uploaded objection document into text. Plain text/CSV is read
   * directly; for scans/PDFs the caller supplies already-OCR'd text via
   * `pastedText` (the seam for a real OCR service — e.g. Tesseract/cloud OCR —
   * which would replace this branch and set extractionSource='OCR').
   */
  private extractText(file: any, pastedText?: string): { text: string; source: string } {
    if (pastedText && pastedText.trim()) return { text: pastedText, source: 'PASTED' };
    const mime = file?.mimetype || '';
    if (file?.buffer && (mime.startsWith('text/') || mime === 'application/csv' || mime === 'text/csv')) {
      return { text: file.buffer.toString('utf8'), source: 'TEXT' };
    }
    // No OCR service wired yet: accept the file but require pasted OCR text for
    // non-text formats so reconciliation has something to work on.
    return { text: '', source: 'NONE' };
  }

  /**
   * Upload an objection document to a case, run Document Intelligence over it
   * (extract declared figures, reconcile against observed inflow), store the
   * verdict, and raise a `document` RiskSignal when it under-declares.
   */
  async addDocument(caseId: string, file: any, opts: { pastedText?: string; staffId?: string }) {
    const kase = await this.prisma.underdeclarationCase.findUnique({
      where: { id: caseId },
      select: { id: true, taxpayerId: true, year: true, observedIncome: true },
    });
    if (!kase) throw new NotFoundException('Case not found');
    if (!file && !opts.pastedText) throw new BadRequestException('A file or pasted document text is required.');

    const { text, source } = this.extractText(file, opts.pastedText);
    if (!text) {
      throw new BadRequestException(
        'Could not read text from this file. Upload a text/CSV file, or paste the OCR text of a scanned/PDF document.',
      );
    }

    const observed = Number(kase.observedIncome ?? 0);
    const extracted = extractFinancials(text);
    const result = reconcile(extracted, observed);
    const { score, severity } = scoreReconciliation(result);

    const doc = await this.prisma.caseDocument.create({
      data: {
        caseId,
        fileName: file?.originalname ?? 'pasted-document.txt',
        mimeType: file?.mimetype ?? 'text/plain',
        fileSizeBytes: file?.size ?? Buffer.byteLength(text, 'utf8'),
        extractedText: text.slice(0, 20000), // cap stored text
        extractionSource: source,
        declaredIncome: extracted.declaredIncome != null ? new Prisma.Decimal(extracted.declaredIncome) : null,
        variance: new Prisma.Decimal(result.variance.toFixed(4)),
        consistent: result.consistent,
        reconcileNote: result.note,
        uploadedById: opts.staffId ?? null,
      },
    });

    // Raise / update a Document Intelligence signal when it under-declares.
    if (result.variance < 0 && score > 0.1) {
      await this.prisma.riskSignal.upsert({
        where: { taxpayerId_year_agentKey: { taxpayerId: kase.taxpayerId, year: kase.year, agentKey: 'document' } },
        create: {
          taxpayerId: kase.taxpayerId, year: kase.year, agentKey: 'document',
          score: new Prisma.Decimal(score.toFixed(2)), severity,
          summary: result.note,
          details: { documentId: doc.id, extracted, observedInflow: observed } as any,
        },
        update: {
          score: new Prisma.Decimal(score.toFixed(2)), severity,
          summary: result.note,
          details: { documentId: doc.id, extracted, observedInflow: observed } as any,
        },
      });
    }

    await this.audit.log({
      actorType: 'STAFF', actorId: opts.staffId, staffId: opts.staffId,
      action: 'UPLOAD_CASE_DOCUMENT', entity: 'CaseDocument', entityId: doc.id,
      afterJson: { caseId, consistent: result.consistent, variance: result.variance, declared: extracted.declaredIncome ?? null },
    });

    return {
      id: doc.id, fileName: doc.fileName, extractionSource: source,
      extracted, reconciliation: result, signalRaised: result.variance < 0 && score > 0.1,
    };
  }

  /** List a case's uploaded documents (metadata + reconciliation verdict; no full text). */
  async listDocuments(caseId: string) {
    return this.prisma.caseDocument.findMany({
      where: { caseId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, fileName: true, mimeType: true, fileSizeBytes: true, extractionSource: true,
        declaredIncome: true, variance: true, consistent: true, reconcileNote: true, createdAt: true,
      },
    });
  }
}
