import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/services/audit.service';
import { randomBytes } from 'crypto';
import { StatutoryService } from '../statutory/statutory.service';

export type PeriodStatus = 'ON_TIME' | 'LATE' | 'MISSING' | 'PENDING';

/**
 * Whole months a filing is in default, counted from its due date to the
 * reference date (the filing date for LATE, "now" for MISSING). Always ≥ 1 once
 * in default — the first month of default is month 1 (NTAA s.101 counts the
 * "first month of default" as a discrete unit, not a pro-rata slice).
 */
export function monthsInDefault(dueAt: Date, asOf: Date): number {
  if (asOf <= dueAt) return 0;
  const ms = asOf.getTime() - dueAt.getTime();
  return Math.max(1, Math.ceil(ms / (30 * 86_400_000)));
}

/**
 * NTAA 2025 s.101 penalty for a return in default: a fixed fine for the first
 * month plus a further fixed fine for each subsequent month it continues.
 *   months=1 → first only; months=3 → first + 2 × perMonth.
 */
export function s101Penalty(months: number, firstMonth: number, perMonth: number): number {
  if (months <= 0) return 0;
  return firstMonth + Math.max(0, months - 1) * perMonth;
}

/**
 * §29 / §6.6 obligation tracking: for each provider, derive the periods it is
 * obliged to report (per its reporting frequency), the statutory due date
 * (period end + the configured reporting-due days), and whether a compliant
 * submission arrived in time — plus per-provider data quality (rejection rate).
 */
@Injectable()
export class ProviderComplianceService {
  constructor(
    private prisma: PrismaService,
    private statutory: StatutoryService,
    private audit: AuditService,
  ) {}

  /** N days after the last day of a quarter (dueDays from active StatutoryConfig). */
  private quarterDue(year: number, q: number, dueDays: number): Date {
    // First day of the month AFTER the quarter ends, then subtract to the last
    // day of the quarter, then add dueDays.
    const endMonthExclusive: Record<number, [number, number]> = {
      1: [year, 3],       // quarter ends 31 Mar → month-start Apr
      2: [year, 6],       // 30 Jun → Jul
      3: [year, 9],       // 30 Sep → Oct
      4: [year + 1, 0],   // 31 Dec → Jan next year
    };
    const [y, m] = endMonthExclusive[q];
    const periodEnd = new Date(Date.UTC(y, m, 0)); // day 0 = last day of prior month
    return this.addDays(periodEnd, dueDays);
  }
  private monthDue(year: number, m: number, dueDays: number): Date {
    const periodEnd = new Date(Date.UTC(year, m, 0)); // last day of month m (1-based)
    return this.addDays(periodEnd, dueDays);
  }
  private addDays(d: Date, days: number): Date {
    return new Date(d.getTime() + days * 86_400_000);
  }

  private expectedPeriods(year: number, frequency: string | null, dueDays: number): { label: string; due: Date }[] {
    const freq = (frequency || 'QUARTERLY').toUpperCase();
    if (freq === 'MONTHLY') {
      return Array.from({ length: 12 }, (_, i) => ({
        label: `${year}-${String(i + 1).padStart(2, '0')}`,
        due: this.monthDue(year, i + 1, dueDays),
      }));
    }
    if (freq === 'ANNUAL') {
      return [{ label: `${year}`, due: this.addDays(new Date(Date.UTC(year, 11, 31)), dueDays) }];
    }
    return [1, 2, 3, 4].map((q) => ({ label: `${year}-Q${q}`, due: this.quarterDue(year, q, dueDays) }));
  }

  async forYear(year: number, providerId?: string) {
    const now = new Date();
    const cfg = await this.statutory.active();
    const dueDays = cfg.reportingDueDays;
    const pFirst = cfg.providerPenaltyFirstMonth;
    const pPer = cfg.providerPenaltyPerMonth;
    // Commencement gate: penalties apply only to periods due on/after this date.
    // Null → no gate (enforce from every due date).
    const pEffective = cfg.providerPenaltyEffectiveFrom ? new Date(cfg.providerPenaltyEffectiveFrom) : null;
    const providers = await this.prisma.dataProvider.findMany({
      where: { ...(providerId ? { id: providerId } : { status: 'ACTIVE' }) },
      select: { id: true, name: true, providerType: true, reportingFrequency: true, status: true },
      orderBy: { name: 'asc' },
    });

    const subs = await this.prisma.dataSubmission.findMany({
      where: { periodYear: year, ...(providerId ? { providerId } : {}) },
      select: { providerId: true, periodLabel: true, status: true, receivedAt: true, recordCount: true, acceptedCount: true, rejectedCount: true },
      orderBy: { receivedAt: 'asc' },
    });

    return providers.map((p) => {
      const mine = subs.filter((s) => s.providerId === p.id);
      const expected = this.expectedPeriods(year, p.reportingFrequency, dueDays);
      const periods = expected.map((e) => {
        const forPeriod = mine.filter((s) => s.periodLabel === e.label && s.status !== 'REJECTED');
        const first = forPeriod[0];
        let status: PeriodStatus;
        if (first) status = first.receivedAt <= e.due ? 'ON_TIME' : 'LATE';
        else status = e.due < now ? 'MISSING' : 'PENDING';
        // NTAA s.101 penalty for a period in default. LATE accrues to the filing
        // date; MISSING keeps accruing to today. ON_TIME/PENDING → no penalty.
        // Commencement gate: a period whose due date precedes the effective date
        // is never penalised (non-retroactive), even if in default.
        const inDefault = status === 'LATE' || status === 'MISSING';
        const enforced = inDefault && (!pEffective || e.due >= pEffective);
        const asOf = status === 'LATE' ? first!.receivedAt : now;
        const months = enforced ? monthsInDefault(e.due, asOf) : 0;
        const penalty = s101Penalty(months, pFirst, pPer);
        return {
          period: e.label, dueAt: e.due, status, receivedAt: first?.receivedAt ?? null,
          monthsInDefault: months, penalty,
          penaltyEnforced: enforced, // false when before the commencement date
        };
      });

      const counts = (st: PeriodStatus) => periods.filter((x) => x.status === st).length;
      const totalRecords = mine.reduce((s, x) => s + x.recordCount, 0);
      const totalRejected = mine.reduce((s, x) => s + x.rejectedCount, 0);
      const due = periods.filter((x) => x.status !== 'PENDING').length;
      const onTime = counts('ON_TIME');
      const penaltyTotal = periods.reduce((s, x) => s + x.penalty, 0);

      return {
        provider: { id: p.id, name: p.name, providerType: p.providerType, status: p.status, reportingFrequency: p.reportingFrequency || 'QUARTERLY' },
        expected: expected.length,
        onTime,
        late: counts('LATE'),
        missing: counts('MISSING'),
        pending: counts('PENDING'),
        complianceRate: due > 0 ? Math.round((onTime / due) * 100) : 100,
        submissions: mine.length,
        rejectionRate: totalRecords > 0 ? Math.round((totalRejected / totalRecords) * 100) : 0,
        penaltyTotal, // NTAA s.101 — total across all late/missing periods this year
        periods,
      };
    });
  }

  async summary(year: number) {
    const rows = await this.forYear(year);
    const totalMissing = rows.reduce((s, r) => s + r.missing, 0);
    const totalLate = rows.reduce((s, r) => s + r.late, 0);
    const totalPenalty = rows.reduce((s, r) => s + r.penaltyTotal, 0);
    const avgCompliance = rows.length ? Math.round(rows.reduce((s, r) => s + r.complianceRate, 0) / rows.length) : 100;
    return {
      year,
      providers: rows.length,
      avgCompliance,
      totalMissing,
      totalLate,
      totalPenalty, // NTAA s.101 — aggregate exposure across all providers this year
      atRisk: rows.filter((r) => r.missing > 0).map((r) => ({ id: r.provider.id, name: r.provider.name, missing: r.missing })),
    };
  }

  // ─── Formal penalty records (NTAA s.101) ────────────────────────────────────

  /**
   * Raise a formal, auditable penalty for ONE provider period that is LATE or
   * MISSING. Idempotent per provider/period (re-issuing refreshes the figures on
   * the currently active statutory config). ON_TIME / PENDING periods are
   * rejected — nothing is owed. A WAIVED or PAID record is left untouched.
   */
  async issuePenalty(providerId: string, periodLabel: string, staffId?: string) {
    const provider = await this.prisma.dataProvider.findUnique({ where: { id: providerId }, select: { id: true, name: true } });
    if (!provider) throw new NotFoundException('Provider not found');

    // Recompute this exact period from the source of truth.
    const yearFromLabel = parseInt(periodLabel.slice(0, 4), 10);
    const rows = await this.forYear(yearFromLabel, providerId);
    const period = rows[0]?.periods.find((p) => p.period === periodLabel);
    if (!period) throw new NotFoundException(`Period ${periodLabel} not expected for this provider.`);
    if (period.status !== 'LATE' && period.status !== 'MISSING') {
      throw new NotFoundException(`Period ${periodLabel} is ${period.status} — no penalty is due.`);
    }
    if (!period.penaltyEnforced) {
      throw new NotFoundException(`Period ${periodLabel} is due before the penalty commencement date — not enforceable.`);
    }

    const existing = await this.prisma.providerPenalty.findUnique({
      where: { providerId_periodLabel: { providerId, periodLabel } },
      select: { id: true, status: true },
    });
    if (existing && (existing.status === 'WAIVED' || existing.status === 'PAID')) {
      return existing; // a resolved penalty is not re-computed/reopened by a rescan
    }

    const cfg = await this.statutory.active();
    const basis = {
      statute: 'NTAA 2025 s.101 (failure/late filing of returns)',
      statutoryVersion: cfg.version,
      reason: period.status,
      dueAt: period.dueAt.toISOString(),
      monthsInDefault: period.monthsInDefault,
      firstMonthAmount: cfg.providerPenaltyFirstMonth,
      perMonthAmount: cfg.providerPenaltyPerMonth,
      formula: 'first + (months - 1) × perMonth',
      amount: period.penalty,
    };
    const data = {
      providerId, periodLabel, periodYear: yearFromLabel, dueAt: period.dueAt,
      reason: period.status, monthsInDefault: period.monthsInDefault,
      firstMonthAmount: new Prisma.Decimal(cfg.providerPenaltyFirstMonth.toFixed(2)),
      perMonthAmount: new Prisma.Decimal(cfg.providerPenaltyPerMonth.toFixed(2)),
      amount: new Prisma.Decimal(period.penalty.toFixed(2)),
      basis: basis as any, statutoryVersion: cfg.version,
      noticeRef: `PPN-${periodLabel}-${randomBytes(3).toString('hex').toUpperCase()}`,
    };

    const saved = await this.prisma.providerPenalty.upsert({
      where: { providerId_periodLabel: { providerId, periodLabel } },
      update: data,        // refresh figures (e.g. a MISSING period accruing further)
      create: { ...data, status: 'ASSESSED' },
    });

    await this.audit.log({
      actorType: 'STAFF', actorId: staffId, staffId,
      action: 'ISSUE_PROVIDER_PENALTY', entity: 'ProviderPenalty', entityId: saved.id,
      afterJson: { providerId, periodLabel, amount: period.penalty, reason: period.status, months: period.monthsInDefault },
    });

    return saved;
  }

  /** Issue penalties for every LATE/MISSING period across all providers in a year. */
  async issueAllForYear(year: number, staffId?: string) {
    const rows = await this.forYear(year);
    let issued = 0;
    const results: { providerId: string; period: string; amount: number }[] = [];
    for (const r of rows) {
      for (const p of r.periods) {
        if (p.status !== 'LATE' && p.status !== 'MISSING') continue;
        try {
          await this.issuePenalty(r.provider.id, p.period, staffId);
          results.push({ providerId: r.provider.id, period: p.period, amount: p.penalty });
          issued += 1;
        } catch { /* skip a period that raced to ON_TIME, etc. */ }
      }
    }
    await this.audit.log({
      actorType: 'STAFF', actorId: staffId, staffId,
      action: 'ISSUE_PROVIDER_PENALTIES_BATCH', entity: 'ProviderPenalty',
      afterJson: { year, issued },
    });
    return { year, issued, results };
  }

  /** List issued penalties (optionally scoped to a provider or year). */
  async listPenalties(opts: { providerId?: string; year?: number; status?: string } = {}) {
    return this.prisma.providerPenalty.findMany({
      where: {
        ...(opts.providerId ? { providerId: opts.providerId } : {}),
        ...(opts.year ? { periodYear: opts.year } : {}),
        ...(opts.status ? { status: opts.status } : {}),
      },
      include: { provider: { select: { id: true, name: true, providerType: true } } },
      orderBy: [{ periodYear: 'desc' }, { amount: 'desc' }],
    });
  }

  /**
   * Render a formal, printable penalty notice (HTML → print/PDF) for one issued
   * penalty and mark it NOTIFIED (serving the notice IS the notification). Reuses
   * the evidence-bundle letterhead/print styling so the authority's documents
   * read as one family. Audited.
   */
  async penaltyNotice(penaltyId: string, staff: { id: string; email?: string }) {
    const p = await this.prisma.providerPenalty.findUnique({
      where: { id: penaltyId },
      include: { provider: { select: { name: true, providerType: true, contactEmail: true, address: true } } },
    });
    if (!p) throw new NotFoundException('Penalty not found');

    const tenant = await this.prisma.tenant.findFirst({ select: { name: true, shortName: true, logoUrl: true } });
    const orgName = tenant?.name || 'Internal Revenue Service';
    const orgShort = tenant?.shortName || 'IRS';
    const orgLogo = tenant?.logoUrl || null;

    // First service marks it NOTIFIED (keep a later PAID/WAIVED untouched).
    if (p.status === 'ASSESSED') {
      await this.prisma.providerPenalty.update({
        where: { id: p.id },
        data: { status: 'NOTIFIED', notifiedAt: new Date() },
      }).catch(() => { /* non-fatal — still serve the notice */ });
    }
    await this.audit.log({
      actorType: 'STAFF', actorId: staff.id, staffId: staff.id,
      action: 'SERVE_PROVIDER_PENALTY_NOTICE', entity: 'ProviderPenalty', entityId: p.id,
      afterJson: { servedBy: staff.email, noticeRef: p.noticeRef, amount: Number(p.amount) },
    });

    const ngn = (v: any) => '₦' + Number(v ?? 0).toLocaleString();
    const esc = (s: any) => String(s ?? '').replace(/[<>&]/g, (ch) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[ch]!));
    const now = new Date();
    const ref = esc(p.noticeRef ?? p.id.slice(0, 8).toUpperCase());
    const genDate = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
    const genTime = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    const reasonLabel = p.reason === 'MISSING' ? 'Failure to file a return' : 'Late filing of a return';
    const first = Number(p.firstMonthAmount);
    const per = Number(p.perMonthAmount);
    const subsequent = Math.max(0, p.monthsInDefault - 1);

    const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Penalty Notice ${ref}</title>
<style>
 :root{--ink:#0f172a;--soft:#475569;--line:#e2e8f0;--brand:#0f766e;--bad:#b91c1c;--bg:#f8fafc}
 *{box-sizing:border-box} html,body{margin:0;padding:0}
 body{font-family:'Segoe UI',Arial,sans-serif;color:var(--ink);font-size:12.5px;line-height:1.5;background:#eef2f6}
 .sheet{max-width:820px;width:100%;margin:20px auto;background:#fff;padding:44px 52px 64px;position:relative;box-shadow:0 1px 4px rgba(15,23,42,.12)}
 .content{position:relative;z-index:1}
 .lh{display:flex;align-items:center;gap:16px;border-bottom:3px solid var(--brand);padding-bottom:14px}
 .crest{flex:0 0 54px;height:54px;border-radius:50%;background:var(--brand);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:18px;letter-spacing:.03em;overflow:hidden}
 .logo-img{height:56px;width:auto;max-width:220px;object-fit:contain}
 .lh h1{font-size:17px;margin:0;color:var(--ink)} .lh .sub{font-size:11px;color:var(--soft);margin-top:2px}
 .class-band{background:var(--brand);color:#fff;font-size:10px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;text-align:center;padding:5px;margin:16px 0 4px;border-radius:3px}
 .doctitle{text-align:center;margin:20px 0 4px} .doctitle h2{font-size:19px;margin:0;letter-spacing:.02em} .doctitle .ref{font-size:11px;color:var(--soft);margin-top:4px}
 h3{font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:var(--brand);border-bottom:1px solid var(--line);padding-bottom:5px;margin:26px 0 10px}
 .grid{display:grid;grid-template-columns:1fr 1fr;gap:6px 24px;font-size:12px}
 .grid .k{color:var(--soft)} .grid .v{font-weight:600}
 table{width:100%;border-collapse:collapse;margin-top:6px;table-layout:fixed;font-size:11.5px}
 th,td{text-align:left;padding:7px 8px;border-bottom:1px solid var(--line);overflow-wrap:anywhere;vertical-align:top}
 th{font-size:9.5px;text-transform:uppercase;letter-spacing:.04em;color:var(--soft);background:var(--bg)}
 .num{text-align:right;font-variant-numeric:tabular-nums} tr.tot td{font-weight:800;color:var(--bad);border-top:2px solid var(--ink);border-bottom:none;background:#fef2f2}
 p.body{font-size:12px;margin:10px 0}
 .note{font-size:10.5px;color:var(--soft);margin-top:8px}
 .sig{display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:44px}
 .sig .line{border-top:1px solid var(--ink);padding-top:5px;font-size:11px;color:var(--soft)}
 .foot{margin-top:36px;border-top:1px solid var(--line);padding-top:10px;font-size:9.5px;color:var(--soft)}
 .toolbar{position:fixed;top:14px;right:14px;z-index:10;display:flex;gap:8px}
 .btn{background:var(--brand);color:#fff;border:none;border-radius:7px;padding:9px 16px;font-size:12px;font-weight:600;cursor:pointer;box-shadow:0 2px 6px rgba(15,23,42,.2)}
 .btn.ghost{background:#fff;color:var(--ink);border:1px solid var(--line)}
 @media print{ @page{size:A4;margin:14mm} body{background:#fff} .sheet{box-shadow:none;margin:0;max-width:none;padding:0} .toolbar,.noprint{display:none!important} }
</style></head><body>
 <div class="toolbar noprint"><button class="btn" onclick="window.print()">Print / Save PDF</button></div>
 <div class="sheet"><div class="content">
   <div class="lh">
     ${orgLogo ? `<img class="logo-img" src="${esc(orgLogo)}" alt="${esc(orgName)}">` : `<div class="crest">${esc(orgShort)}</div>`}
     <div><h1>${esc(orgName)}</h1><div class="sub">Third-Party Reporting Compliance · Provider Enforcement</div></div>
   </div>
   <div class="class-band">Notice of administrative penalty · NTAA 2025 §101</div>

   <div class="doctitle">
     <h2>Provider Penalty Notice</h2>
     <div class="ref">Ref: <strong>${ref}</strong> · Period ${esc(p.periodLabel)} · Issued ${genDate} ${genTime}</div>
   </div>

   <h3>Reporting entity</h3>
   <div class="grid">
     <div><span class="k">Provider:</span> <span class="v">${esc(p.provider.name)}</span></div>
     <div><span class="k">Type:</span> <span class="v">${esc(String(p.provider.providerType).replace(/_/g, ' '))}</span></div>
     <div><span class="k">Contact:</span> <span class="v">${esc(p.provider.contactEmail ?? '—')}</span></div>
     <div><span class="k">Address:</span> <span class="v">${esc(p.provider.address ?? '—')}</span></div>
   </div>

   <p class="body">
     Records held by ${esc(orgName)} show that the statutory return for the period
     <strong>${esc(p.periodLabel)}</strong> was, as at the date of this notice,
     <strong>${esc(reasonLabel.toLowerCase())}</strong>. The return fell due on
     <strong>${esc(p.dueAt.toDateString())}</strong> (NTAA 2025 §29). An administrative
     penalty is accordingly assessed under NTAA 2025 §101.
   </p>

   <h3>Penalty assessment — NTAA 2025 §101</h3>
   <table>
    <tr><td>Basis of default</td><td class="num">${esc(reasonLabel)}</td></tr>
    <tr><td>Return due date (§29)</td><td class="num">${esc(p.dueAt.toDateString())}</td></tr>
    <tr><td>Whole months in default</td><td class="num">${p.monthsInDefault}</td></tr>
    <tr><td>First month of default</td><td class="num">${ngn(first)}</td></tr>
    <tr><td>Subsequent months (${subsequent} × ${ngn(per)})</td><td class="num">${ngn(subsequent * per)}</td></tr>
    <tr class="tot"><td>Total penalty payable</td><td class="num">${ngn(p.amount)}</td></tr>
   </table>
   <p class="note">Computed as the first-month fine plus a further fine for each subsequent month the default continues
   (§101). Statutory config version ${p.statutoryVersion ?? '—'}. The penalty continues to accrue until the return is filed.</p>

   <p class="body">
     To resolve this notice, file the outstanding return without further delay and settle the penalty above through
     the channels prescribed by ${esc(orgName)}. Filing the return stops further monthly accrual. If you believe this
     notice is issued in error, contact the authority quoting the reference above.
   </p>

   <div class="sig">
     <div class="line">Authorised officer, ${esc(orgName)}</div>
     <div class="line">Date of service</div>
   </div>

   <div class="foot">
     This is an official notice generated by ${esc(orgName)}. Ref ${ref}. Served ${genDate} ${genTime}.
     NTAA 2025 §101 (failure/late filing of returns) · §29 (reporting obligation).
   </div>
 </div></div>
</body></html>`;

    return html;
  }
}
