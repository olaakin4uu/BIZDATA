import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { Prisma, CaseStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/services/audit.service';
import { CryptoService } from '../../common/services/crypto.service';
import { PiiAccessService } from '../../common/services/pii-access.service';
import { extractFinancials, reconcile, scoreReconciliation, computeCgt } from '../agents/implementations/document-intelligence.agent';
import { severityFor } from '../agents/agent.types';
import { StatutoryService } from '../statutory/statutory.service';
import { ReportableService } from '../../common/services/reportable.service';

// Statutory windows / rates. CONFIRM against the gazetted NTAA/NTA text — kept
// as named constants so they can move to tenant config.
// NOTE: statutory windows and the penalty rate now come from the versioned
// StatutoryConfig (see StatutoryService), read per-assessment so a change in the
// law is a settings change, not a code change. The former constants
// (OBJECTION_WINDOW_DAYS=30, AUTHORITY_RESPONSE_DAYS=90, penalty=10%) were seeded
// as StatutoryConfig version 1.

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
    private statutory: StatutoryService,
    private reportable: ReportableService,
  ) {}

  // STATUTORY REPORTING THRESHOLD — a where-fragment limiting cases to reportable
  // taxpayers. Cases are only created for reportable taxpayers (the scan is
  // gated), but this also hides any pre-threshold cases from list/stats views.
  private async reportableWhere(year?: number): Promise<Prisma.UnderdeclarationCaseWhereInput> {
    const ids = await this.reportable.reportableTaxpayerIds(year ? { year } : {});
    return { taxpayerId: { in: [...ids] } };
  }

  /** Dashboard headline metrics, the detection→recovery funnel, and breakdowns. */
  async stats(query: { year?: string } = {}) {
    const year = query.year ? parseInt(query.year, 10) : undefined;
    const where: Prisma.UnderdeclarationCaseWhereInput = {
      ...(year ? { year } : {}),
      ...(await this.reportableWhere(year)),
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
      ...(await this.reportableWhere(query.year ? parseInt(query.year, 10) : undefined)),
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

    // Organisation branding for the letterhead (logo uploaded under Settings).
    const tenant = await this.prisma.tenant.findFirst({ select: { name: true, shortName: true, logoUrl: true } });
    const orgName = tenant?.name || 'Internal Revenue Service';
    const orgShort = tenant?.shortName || 'IRS';
    const orgLogo = tenant?.logoUrl || null;

    const clear = await this.pii.canRevealPii();
    const tp = c.taxpayer;
    const name = tp.businessName || [tp.firstName, tp.lastName].filter(Boolean).join(' ') || 'Unknown';
    const tin = this.crypto.decrypt(tp.tinEnc);
    const bvn = this.pii.reveal(this.crypto.decrypt(tp.bvnEnc), 'bvn', clear);
    const nin = this.pii.reveal(this.crypto.decrypt(tp.ninEnc), 'nin', clear);

    // Ordered by provider → account number → date so the printed source-records
    // table reads grouped the same way as the on-screen cross-provider ledger.
    const records = await this.prisma.dataRecord.findMany({
      where: { taxpayerId: c.taxpayerId, periodYear: c.year },
      include: { provider: { select: { name: true } } },
      orderBy: [{ provider: { name: 'asc' } }, { accountNumber: 'asc' }, { totalInflow: 'desc' }],
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

    const ref = esc(c.demandNoticeRef ?? c.id.slice(0, 8).toUpperCase());
    const genDate = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
    const genTime = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

    // Group source records by provider → account number so each account reads as
    // one block (header + its dated transactions + a subtotal), matching the
    // on-screen cross-provider ledger.
    type Rec = (typeof records)[number];
    const dateOf = (r: Rec) => ((r.payload ?? {}) as { transactionDate?: string }).transactionDate ?? '';
    const provMap = new Map<string, { provider: string; accts: Map<string, Rec[]> }>();
    for (const r of records) {
      const pname = r.provider?.name ?? r.providerType;
      if (!provMap.has(pname)) provMap.set(pname, { provider: pname, accts: new Map() });
      const acctNo = r.accountNumber ?? '(no account no.)';
      const accts = provMap.get(pname)!.accts;
      if (!accts.has(acctNo)) accts.set(acctNo, []);
      accts.get(acctNo)!.push(r);
    }
    const sumBy = (rows: Rec[], k: 'totalInflow' | 'totalOutflow') => rows.reduce((s, x) => s + Number((x as any)[k] ?? 0), 0);
    const provTotal = (p: { accts: Map<string, Rec[]> }) => {
      let n = 0; for (const rows of p.accts.values()) n += sumBy(rows, 'totalInflow'); return n;
    };
    const sourceRecordsHtml = [...provMap.values()]
      .sort((a, b) => provTotal(b) - provTotal(a))
      .map((p) => {
        const acctBlocks = [...p.accts.entries()]
          .sort((a, b) => sumBy(b[1], 'totalInflow') - sumBy(a[1], 'totalInflow'))
          .map(([acctNo, rows]) => {
            const sorted = [...rows].sort((a, b) => dateOf(a).localeCompare(dateOf(b)));
            const name = sorted[0]?.accountName ?? '';
            const txns = sorted.map((r) => {
              const pl = (r.payload ?? {}) as { transactionDate?: string };
              return `<tr><td>${esc(pl.transactionDate ?? '—')}</td><td>${esc(r.periodLabel)}</td><td class="num">${ngn(r.totalInflow)}</td><td class="num">${ngn(r.totalOutflow)}</td><td>${esc(r.matchMethod ?? '—')}</td></tr>`;
            }).join('');
            return `<tr class="acct-hd"><td colspan="5">Account <span class="mono">${esc(acctNo)}</span>${name ? ` · ${esc(name)}` : ''} <span class="note">(${sorted.length} txn)</span></td></tr>
             ${txns}
             <tr class="acct-sub"><td colspan="2">Account subtotal</td><td class="num">${ngn(sumBy(rows, 'totalInflow'))}</td><td class="num">${ngn(sumBy(rows, 'totalOutflow'))}</td><td></td></tr>`;
          }).join('');
        return `<div class="prov-hd">${esc(p.provider)} <span class="note">(${p.accts.size} account${p.accts.size === 1 ? '' : 's'})</span></div>
         <table class="rec"><colgroup><col style="width:16%"><col style="width:12%"><col style="width:24%"><col style="width:24%"><col style="width:12%"></colgroup>
         <tr><th>Date</th><th>Period</th><th class="num">Inflow</th><th class="num">Outflow</th><th>Match</th></tr>
         ${acctBlocks}
         </table>`;
      }).join('');

    const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Evidence Bundle ${ref}</title>
<style>
 :root{--ink:#0f172a;--soft:#475569;--line:#e2e8f0;--brand:#0f766e;--bad:#b91c1c;--bg:#f8fafc}
 *{box-sizing:border-box}
 html,body{margin:0;padding:0}
 body{font-family:'Segoe UI',Arial,sans-serif;color:var(--ink);font-size:12.5px;line-height:1.5;background:#eef2f6}
 .sheet{max-width:820px;width:100%;margin:20px auto;background:#fff;padding:44px 52px 64px;position:relative;box-shadow:0 1px 4px rgba(15,23,42,.12)}
 /* diagonal confidential watermark across the page */
 .paper-wm{position:absolute;inset:0;overflow:hidden;pointer-events:none;z-index:0}
 .paper-wm span{position:absolute;top:42%;left:-8%;width:120%;text-align:center;transform:rotate(-24deg);font-size:64px;font-weight:800;letter-spacing:.12em;color:rgba(185,28,28,.06);text-transform:uppercase}
 .content{position:relative;z-index:1}
 /* letterhead */
 .lh{display:flex;align-items:center;gap:16px;border-bottom:3px solid var(--brand);padding-bottom:14px}
 .crest{flex:0 0 54px;height:54px;border-radius:50%;background:var(--brand);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:18px;letter-spacing:.03em;overflow:hidden}
 .crest img{width:100%;height:100%;object-fit:contain;background:#fff}
 .logo-img{height:56px;width:auto;max-width:220px;object-fit:contain}
 .lh h1{font-size:17px;margin:0;color:var(--ink)} .lh .sub{font-size:11px;color:var(--soft);margin-top:2px}
 .class-band{background:var(--bad);color:#fff;font-size:10px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;text-align:center;padding:5px;margin:16px 0 4px;border-radius:3px}
 .doctitle{text-align:center;margin:20px 0 4px} .doctitle h2{font-size:19px;margin:0;letter-spacing:.02em} .doctitle .ref{font-size:11px;color:var(--soft);margin-top:4px}
 h3{font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:var(--brand);border-bottom:1px solid var(--line);padding-bottom:5px;margin:26px 0 10px}
 .grid{display:grid;grid-template-columns:1fr 1fr;gap:6px 24px;font-size:12px}
 .grid .k{color:var(--soft)} .grid .v{font-weight:600}
 table{width:100%;border-collapse:collapse;margin-top:6px;table-layout:fixed;font-size:11.5px}
 th,td{text-align:left;padding:7px 8px;border-bottom:1px solid var(--line);overflow-wrap:anywhere;vertical-align:top}
 th{font-size:9.5px;text-transform:uppercase;letter-spacing:.04em;color:var(--soft);background:var(--bg)}
 .num{text-align:right;font-variant-numeric:tabular-nums} tr.tot td{font-weight:800;color:var(--bad);border-top:2px solid var(--ink);border-bottom:none;background:#fef2f2}
 ul{margin:6px 0;padding-left:18px} li{margin:3px 0}
 .note{font-size:10.5px;color:var(--soft);margin-top:8px}
 .mono{font-family:Consolas,monospace}
 .prov-hd{margin-top:16px;font-weight:700;font-size:12.5px;color:var(--ink);border-bottom:2px solid var(--brand);padding-bottom:3px}
 table.rec{margin-top:2px} table.rec{page-break-inside:auto}
 tr.acct-hd td{background:#eef2f6;font-weight:700;color:var(--brand);border-bottom:1px solid var(--line);font-size:11px}
 tr.acct-sub td{font-weight:700;border-top:1px solid var(--soft);border-bottom:2px solid var(--line);background:#fafcfe}
 tr{page-break-inside:avoid}
 .sig{display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:44px}
 .sig .line{border-top:1px solid var(--ink);padding-top:5px;font-size:11px;color:var(--soft)}
 .foot{margin-top:36px;border-top:1px solid var(--line);padding-top:10px;font-size:9.5px;color:var(--soft)}
 code{font-family:Consolas,monospace;font-size:9.5px;word-break:break-all}
 .toolbar{position:fixed;top:14px;right:14px;z-index:10;display:flex;gap:8px}
 .btn{background:var(--brand);color:#fff;border:none;border-radius:7px;padding:9px 16px;font-size:12px;font-weight:600;cursor:pointer;box-shadow:0 2px 6px rgba(15,23,42,.2)}
 .btn.ghost{background:#fff;color:var(--ink);border:1px solid var(--line)}
 @media print{
   @page{size:A4;margin:14mm}
   body{background:#fff} .sheet{box-shadow:none;margin:0;max-width:none;padding:0}
   .toolbar,.noprint{display:none!important}
   .paper-wm span{color:rgba(185,28,28,.08)}
 }
</style></head><body>
 <div class="sheet">
  <div class="paper-wm"><span>Confidential — ${esc(orgShort)}</span></div>
  <div class="content">
   <div class="lh">
     ${orgLogo
       ? `<img class="logo-img" src="${esc(orgLogo)}" alt="${esc(orgName)}">`
       : `<div class="crest">${esc(orgShort)}</div>`}
     <div>
       <h1>${esc(orgName)}</h1>
       <div class="sub">Bank Reports Intelligence System · Enforcement &amp; Assessment</div>
     </div>
   </div>
   <div class="class-band">Confidential — for official use only · NTAA 2025 §139</div>

   <div class="doctitle">
     <h2>Under-Declaration Evidence Bundle</h2>
     <div class="ref">Ref: <strong>${ref}</strong> · Tax year ${c.year} · Generated ${genDate} ${genTime}</div>
   </div>

   <h3>Taxpayer</h3>
   <div class="grid">
     <div><span class="k">Name:</span> <span class="v">${esc(name)}</span></div>
     <div><span class="k">Type:</span> <span class="v">${esc(tp.type)}</span></div>
     <div><span class="k">TIN:</span> <span class="v">${esc(tin ?? '—')}</span></div>
     <div><span class="k">BVN:</span> <span class="v">${esc(bvn ?? '—')}</span></div>
     <div><span class="k">NIN:</span> <span class="v">${esc(nin ?? '—')}</span></div>
     <div><span class="k">State:</span> <span class="v">${esc(tp.stateOfResidence ?? '—')}</span></div>
     <div><span class="k">Sector:</span> <span class="v">${esc(tp.sector ?? '—')}</span></div>
     <div><span class="k">Case status:</span> <span class="v">${esc(c.status)}</span></div>
   </div>

   <h3>Assessment — NTAA 2025 §35 (Best of Judgement)</h3>
   <table>
    <tr><td>Observed income (bank-reported)</td><td class="num">${ngn(c.observedIncome)}</td></tr>
    <tr><td>Declared income</td><td class="num">${ngn(c.declaredIncome)}</td></tr>
    <tr><td>Discrepancy</td><td class="num">${ngn(c.discrepancyAmount)}</td></tr>
    <tr><td>Assessed tax</td><td class="num">${ngn(c.assessedTax)}</td></tr>
    <tr><td>Late-payment penalty (10%)</td><td class="num">${ngn(c.penaltyAmount)}</td></tr>
    <tr class="tot"><td>Total demand</td><td class="num">${ngn(c.assessedTotal)}</td></tr>
   </table>
   <p class="note">Detection confidence ${Math.round(Number(c.confidence) * 100)}%${c.agentScore != null ? ` · AI corroboration ${Math.round(Number(c.agentScore) * 100)}%` : ''} · engine ${esc(c.scan?.engineVersion ?? c.engineVersion ?? '—')}.
   Objection due ${c.objectionDueAt ? esc(new Date(c.objectionDueAt).toDateString()) : '—'} (§41); authority response due ${c.authorityResponseDueAt ? esc(new Date(c.authorityResponseDueAt).toDateString()) : '—'} (§41(6)).</p>

   <h3>Basis — why flagged</h3>
   <ul>${reasons.map((r) => `<li>${esc(r.label)} <span class="note">(${esc(r.code)})</span></li>`).join('') || '<li class="note">No reason codes.</li>'}</ul>

   <h3>AI analytics signals</h3>
   <table><colgroup><col style="width:22%"><col style="width:16%"><col style="width:12%"><col style="width:50%"></colgroup>
   <tr><th>Agent</th><th>Severity</th><th class="num">Score</th><th>Summary</th></tr>
   ${signals.map((s) => `<tr><td>${esc(s.agentKey)}</td><td>${esc(s.severity)}</td><td class="num">${Math.round(Number(s.score) * 100)}%</td><td>${esc(s.summary)}</td></tr>`).join('') || '<tr><td colspan="4" class="note">No agent signals.</td></tr>'}
   </table>

   <h3>Source records (${records.length}) — grouped by provider &amp; account</h3>
   ${sourceRecordsHtml}

   <div class="sig">
     <div class="line">Prepared by — Assessing Officer</div>
     <div class="line">Approved by — Head of Enforcement</div>
   </div>

   <h3>Integrity &amp; chain of custody</h3>
   <p class="note">This bundle and its export are recorded in the tamper-evident, SHA-256 hash-chained audit trail. Exported by <strong>${esc(staff.email ?? staff.id)}</strong> on ${genDate} ${genTime}.<br>
   Chain anchor: <code>${esc(anchor?.hashChainCurr ?? 'n/a')}</code></p>

   <div class="foot">
     CONFIDENTIAL — Generated by ${esc(staff.email ?? staff.id)} · ${esc(now.toISOString())}. Unauthorised disclosure is an offence under the NTAA 2025 confidentiality provisions.
   </div>
  </div>
 </div>
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

    // Read the active statutory parameters — windows, penalty rate — from config.
    const cfg = await this.statutory.active();

    const data: Prisma.UnderdeclarationCaseUpdateInput = { status: dto.to };
    if (dto.notes) data.notes = dto.notes;
    if (dto.to === 'NOTICE_ISSUED') {
      const now = new Date();
      data.noticeIssuedAt = now;
      data.objectionDueAt = new Date(now.getTime() + cfg.objectionWindowDays * 86_400_000);
      data.statutoryVersion = cfg.version; // record the law version used for this assessment
      // Scoped token for the taxpayer-integration API — embedded in the notice so
      // the taxpayer's platform can act on this case only.
      if (!current.caseAccessToken) {
        data.caseAccessToken = `cat_${randomBytes(24).toString('hex')}`;
      }
      // §35 Best-of-Judgement assessment: tax on the discrepancy + penalty.
      const assessedTax = Number(current.estimatedTaxDue);
      const penalty = assessedTax * cfg.latePaymentPenaltyRate;
      const total = assessedTax + penalty;
      data.assessedTax = new Prisma.Decimal(assessedTax.toFixed(2));
      data.penaltyAmount = new Prisma.Decimal(penalty.toFixed(2));
      data.assessedTotal = new Prisma.Decimal(total.toFixed(2));
      data.demandNoticeRef = `DN-${current.year}-${id.slice(0, 6).toUpperCase()}`;
      data.assessmentBasis = {
        statute: 'NTAA 2025 s.35 (Best of Judgement)',
        statutoryVersion: cfg.version,
        observedIncome: Number(current.observedIncome),
        declaredIncome: Number(current.declaredIncome),
        discrepancy: Number(current.discrepancyAmount),
        assessedTax,
        penaltyRate: cfg.latePaymentPenaltyRate,
        penalty,
        total,
        objectionWindowDays: cfg.objectionWindowDays,
        issuedAt: now.toISOString(),
      } as any;
    }
    if (dto.to === 'OBJECTION') {
      // §41(6): the authority has N days to respond or the objection is deemed upheld.
      data.authorityResponseDueAt = new Date(Date.now() + cfg.authorityResponseDays * 86_400_000);
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
      actorType: staffId ? 'STAFF' : 'SYSTEM',
      actorId: staffId ?? undefined,
      staffId: staffId ?? undefined,
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

    // Capital-gains (NTA §50): if the document reports an asset disposal, assess
    // CGT on the proceeds at the configured rate (best-of-judgement).
    const cfg = await this.statutory.active();
    const cgt = computeCgt(extracted, cfg.cgtRate);

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
        assetDisposals: cgt ? new Prisma.Decimal(cgt.proceeds.toFixed(2)) : null,
        cgtAssessed: cgt ? new Prisma.Decimal(cgt.cgt.toFixed(2)) : null,
        uploadedById: opts.staffId ?? null,
      },
    });

    // Raise / update a Document Intelligence signal when the document
    // under-declares income OR reveals an undeclared asset disposal (CGT).
    const underDeclared = result.variance < 0 && score > 0.1;
    const signalRaised = underDeclared || cgt != null;
    if (signalRaised) {
      // Combine the reconciliation and CGT notes; a disposal pushes concern up.
      const summary = [result.note, cgt?.note].filter(Boolean).join(' ');
      const combinedScore = Math.max(score, cgt ? 0.6 : 0);
      await this.prisma.riskSignal.upsert({
        where: { taxpayerId_year_agentKey: { taxpayerId: kase.taxpayerId, year: kase.year, agentKey: 'document' } },
        create: {
          taxpayerId: kase.taxpayerId, year: kase.year, agentKey: 'document',
          score: new Prisma.Decimal(combinedScore.toFixed(2)), severity: severityFor(combinedScore),
          summary,
          details: { documentId: doc.id, extracted, observedInflow: observed, cgt: cgt ?? undefined } as any,
        },
        update: {
          score: new Prisma.Decimal(combinedScore.toFixed(2)), severity: severityFor(combinedScore),
          summary,
          details: { documentId: doc.id, extracted, observedInflow: observed, cgt: cgt ?? undefined } as any,
        },
      });
    }

    await this.audit.log({
      actorType: 'STAFF', actorId: opts.staffId, staffId: opts.staffId,
      action: 'UPLOAD_CASE_DOCUMENT', entity: 'CaseDocument', entityId: doc.id,
      afterJson: { caseId, consistent: result.consistent, variance: result.variance, declared: extracted.declaredIncome ?? null, cgtAssessed: cgt?.cgt ?? null },
    });

    return {
      id: doc.id, fileName: doc.fileName, extractionSource: source,
      extracted, reconciliation: result, cgt: cgt ?? null, signalRaised,
    };
  }

  /** List a case's uploaded documents (metadata + reconciliation verdict; no full text). */
  async listDocuments(caseId: string) {
    return this.prisma.caseDocument.findMany({
      where: { caseId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, fileName: true, mimeType: true, fileSizeBytes: true, extractionSource: true,
        declaredIncome: true, variance: true, consistent: true, reconcileNote: true,
        assetDisposals: true, cgtAssessed: true, createdAt: true,
      },
    });
  }
}
