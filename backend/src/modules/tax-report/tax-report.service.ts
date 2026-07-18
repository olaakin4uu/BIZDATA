import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/services/audit.service';
import { CryptoService } from '../../common/services/crypto.service';
import { PiiAccessService } from '../../common/services/pii-access.service';
import { StatutoryService } from '../statutory/statutory.service';

const TAX_TYPES = ['PAYE', 'WHT', 'CGT', 'CIT', 'VAT', 'OTHER'];

@Injectable()
export class TaxReportService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private crypto: CryptoService,
    private pii: PiiAccessService,
    private statutory: StatutoryService,
  ) {}

  // ─── Tax-app push: tax PAYMENTS by type (API-key authenticated) ─────────────
  // Mirrors POST /integration/paye and /integration/declared-income. The Tax app
  // pushes each taxpayer's payments by type, matched by RC number / TIN.
  async syncPayments(body: any, opts: { dryRun?: boolean; partnerName?: string } = {}) {
    const rows: any[] = Array.isArray(body) ? body : Array.isArray(body?.records) ? body.records : null;
    if (!rows) throw new BadRequestException('Body must be a JSON array (or { records: [...] }).');
    const str = (v: any) => (v == null ? undefined : String(v).trim() || undefined);
    const num = (v: any) => { const n = Number(v); return Number.isFinite(n) ? n : NaN; };

    let matched = 0, upserted = 0, unmatched = 0;
    const errors: string[] = [];

    for (let i = 0; i < rows.length; i++) {
      const it = rows[i];
      const where = `row ${i + 1}`;
      const rc = str(it?.rcNumber ?? it?.cacRcNumber);
      const tin = str(it?.tin ?? it?.taxpayerTin);
      const taxType = String(str(it?.taxType ?? it?.type) ?? '').toUpperCase();
      const year = parseInt(str(it?.year) ?? '', 10);
      const amount = num(it?.amountPaid ?? it?.amount);

      if (!rc && !tin) { errors.push(`${where}: needs rcNumber or tin.`); unmatched++; continue; }
      if (!TAX_TYPES.includes(taxType)) { errors.push(`${where}: taxType must be one of ${TAX_TYPES.join('/')}.`); continue; }
      if (!year) { errors.push(`${where}: year required.`); continue; }
      if (Number.isNaN(amount)) { errors.push(`${where}: amountPaid must be a number.`); continue; }

      const tp = await this.prisma.taxpayer.findFirst({
        where: {
          OR: [
            ...(rc ? [{ cacRcNumber: rc }] : []),
            ...(tin ? [{ tinIndex: this.crypto.blindIndex(tin)! }] : []),
          ],
        },
        select: { id: true },
      });
      if (!tp) { errors.push(`${where}: no taxpayer matches ${rc ? `RC ${rc}` : 'TIN'}.`); unmatched++; continue; }

      matched++;
      if (opts.dryRun) continue;

      const period = str(it?.period);
      const reference = str(it?.reference ?? it?.receipt);
      // One row per (taxpayer, type, year, period) — re-sync overwrites.
      const existing = await this.prisma.taxPayment.findFirst({
        where: { taxpayerId: tp.id, taxType, year, period: period ?? null },
        select: { id: true },
      });
      if (existing) {
        await this.prisma.taxPayment.update({
          where: { id: existing.id },
          data: { amountPaid: amount, reference, source: 'TAX_APP_SYNC', paidAt: it?.paidAt ? new Date(it.paidAt) : undefined },
        });
      } else {
        await this.prisma.taxPayment.create({
          data: { taxpayerId: tp.id, taxType, year, period: period ?? null, amountPaid: amount, reference, source: 'TAX_APP_SYNC', paidAt: it?.paidAt ? new Date(it.paidAt) : undefined },
        });
      }
      upserted++;
    }

    if (!opts.dryRun) {
      await this.audit.log({
        actorType: 'SYSTEM', action: 'SYNC_TAX_PAYMENTS', entity: 'TaxPayment',
        afterJson: { matched, upserted, unmatched, ...(opts.partnerName ? { partner: opts.partnerName } : {}) },
      });
    }
    return { total: rows.length, matched, upserted, unmatched, dryRun: !!opts.dryRun, errors: errors.slice(0, 50) };
  }

  // ─── Manual staff entry of one tax payment ──────────────────────────────────
  async addPaymentManual(taxpayerId: string, dto: any, staffId?: string) {
    const taxType = String(dto?.taxType || '').toUpperCase();
    if (!TAX_TYPES.includes(taxType)) throw new BadRequestException(`taxType must be one of ${TAX_TYPES.join('/')}`);
    const year = parseInt(dto?.year, 10);
    const amount = Number(dto?.amountPaid);
    if (!year || Number.isNaN(amount)) throw new BadRequestException('year and amountPaid required');
    const tp = await this.prisma.taxpayer.findUnique({ where: { id: taxpayerId }, select: { id: true } });
    if (!tp) throw new NotFoundException('Taxpayer not found');

    const rec = await this.prisma.taxPayment.create({
      data: { taxpayerId, taxType, year, period: dto?.period ?? null, amountPaid: amount, reference: dto?.reference ?? null, source: 'MANUAL', paidAt: dto?.paidAt ? new Date(dto.paidAt) : undefined },
    });
    await this.audit.log({
      actorType: 'STAFF', actorId: staffId, staffId, action: 'ADD_TAX_PAYMENT',
      entity: 'TaxPayment', entityId: rec.id, afterJson: { taxType, year, amount },
    });
    return rec;
  }

  // ─── The AI tax report for one taxpayer ─────────────────────────────────────
  async taxReport(taxpayerId: string, opts: { year?: number } = {}) {
    const tp = await this.prisma.taxpayer.findUnique({ where: { id: taxpayerId } });
    if (!tp) throw new NotFoundException('Taxpayer not found');
    const clear = await this.pii.canRevealPii();
    const cfg = await this.statutory.active();

    const name = tp.businessName || [tp.firstName, tp.middleName, tp.lastName].filter(Boolean).join(' ') || 'Unknown';

    // ── Income: observed (provider) per year, declared, undeclared ──
    const recWhere = { taxpayerId, ...(opts.year ? { periodYear: opts.year } : {}) };
    const obs = await this.prisma.dataRecord.groupBy({
      by: ['periodYear'], where: recWhere, _sum: { totalInflow: true, totalOutflow: true }, _count: { _all: true },
    });
    const declared = await this.prisma.declaredIncome.findMany({
      where: { taxpayerId, ...(opts.year ? { year: opts.year } : {}) }, orderBy: { year: 'desc' },
    });
    const declaredByYear = new Map(declared.map((d) => [d.year, Number(d.assessableIncome)]));

    const incomeByYear = obs.map((o) => {
      const observed = Number(o._sum.totalInflow ?? 0);
      const dec = declaredByYear.get(o.periodYear) ?? 0;
      const undeclared = Math.max(0, observed - dec);
      return {
        year: o.periodYear, observedIncome: observed, declaredIncome: dec, undeclaredIncome: undeclared,
        discrepancyPct: dec > 0 ? undeclared / dec : observed > 0 ? 1 : 0, records: o._count._all,
      };
    }).sort((a, b) => b.year - a.year);

    // ── Per-type tax cards: paid (from Tax app) vs assessed (BIZDATA estimate) ──
    const payments = await this.prisma.taxPayment.findMany({
      where: { taxpayerId, ...(opts.year ? { year: opts.year } : {}) }, orderBy: [{ year: 'desc' }, { taxType: 'asc' }],
    });
    const paidByType = new Map<string, number>();
    for (const p of payments) paidByType.set(p.taxType, (paidByType.get(p.taxType) ?? 0) + Number(p.amountPaid));

    // Estimated liabilities from what BIZDATA observes.
    const totalUndeclared = incomeByYear.reduce((s, y) => s + y.undeclaredIncome, 0);
    const estIncomeTax = totalUndeclared * (tp.type === 'CORPORATE' ? cfg.citRate : 0.24); // corp CIT vs indiv top PIT band
    const taxCards = TAX_TYPES.filter((t) => t !== 'OTHER').map((taxType) => ({
      taxType,
      paid: paidByType.get(taxType) ?? 0,
      onFile: paidByType.has(taxType),
      // A rough assessed figure where we can compute one; else null (data-driven only).
      assessed: taxType === 'CIT' && tp.type === 'CORPORATE' ? estIncomeTax
        : taxType === 'CGT' ? Number(cfg.cgtRate) * 0 // needs disposal data — populated by document intelligence
        : null,
    }));

    // ── Cross-provider identity breakdown: which providers reported this
    //    customer, and their transactions in each provider's records. This is the
    //    cross-matched-identity picture (same person seen across banks/insurers). ──
    const recs = await this.prisma.dataRecord.findMany({
      where: recWhere,
      select: {
        id: true, providerType: true, periodLabel: true, periodYear: true,
        accountNumber: true, accountName: true, bvn: true, nin: true,
        totalInflow: true, totalOutflow: true, transactionCount: true, matchMethod: true, matchConfidence: true, payload: true,
        provider: { select: { id: true, name: true, providerType: true } },
      },
      orderBy: [{ totalInflow: 'desc' }],
    });
    const provMap = new Map<string, any>();
    for (const r of recs) {
      const key = r.provider.id;
      const g = provMap.get(key) ?? {
        providerId: r.provider.id, providerName: r.provider.name, providerType: r.provider.providerType,
        totalInflow: 0, totalOutflow: 0, recordCount: 0, matchMethods: new Set<string>(), transactions: [] as any[],
      };
      g.totalInflow += Number(r.totalInflow ?? 0);
      g.totalOutflow += Number(r.totalOutflow ?? 0);
      g.recordCount += 1;
      if (r.matchMethod) g.matchMethods.add(r.matchMethod);
      g.transactions.push({
        period: r.periodLabel,
        // account number + identifiers masked unless authorised
        accountNumber: this.pii.reveal(this.crypto.decrypt(r.accountNumber), 'account', clear),
        accountName: r.accountName,
        bvn: this.pii.reveal(this.crypto.decrypt(r.bvn), 'bvn', clear),
        nin: this.pii.reveal(this.crypto.decrypt(r.nin), 'nin', clear),
        inflow: Number(r.totalInflow ?? 0),
        outflow: Number(r.totalOutflow ?? 0),
        transactionCount: r.transactionCount,
        matchMethod: r.matchMethod,
        matchConfidence: r.matchConfidence != null ? Number(r.matchConfidence) : null,
        detail: r.payload ?? null,   // provider-specific per-transaction payload if present
      });
      provMap.set(key, g);
    }
    const providerBreakdown = [...provMap.values()]
      .map((g) => ({ ...g, matchMethods: [...g.matchMethods], sameAtOtherProviders: false }))
      .sort((a, b) => b.totalInflow - a.totalInflow);

    // ── CROSS-PROVIDER IDENTITY MATCH ──
    // Take this customer's identifiers (encrypted BVN/NIN + account number) and
    // find records at OTHER providers carrying the SAME identifier — even if they
    // resolved to a different taxpayerId (catches fragmented/same-person spread).
    // Match priority: BVN → NIN → account. (TIN lives on the taxpayer, not the
    // record; the taxpayer-level resolution already keys on it.)
    const myBvns = [...new Set(recs.map((r) => r.bvn).filter(Boolean))] as string[];      // encrypted values
    const myNins = [...new Set(recs.map((r) => r.nin).filter(Boolean))] as string[];
    const myAccts = [...new Set(recs.map((r) => r.accountNumber).filter(Boolean))] as string[];
    const myProviderIds = new Set(providerBreakdown.map((p) => p.providerId));

    const linkMatches = (myBvns.length || myNins.length || myAccts.length)
      ? await this.prisma.dataRecord.findMany({
          where: {
            taxpayerId: { not: taxpayerId },  // records NOT already under this taxpayer
            OR: [
              ...(myBvns.length ? [{ bvn: { in: myBvns } }] : []),
              ...(myNins.length ? [{ nin: { in: myNins } }] : []),
              ...(myAccts.length ? [{ accountNumber: { in: myAccts } }] : []),
            ],
          },
          select: {
            taxpayerId: true, bvn: true, nin: true, accountNumber: true, accountName: true,
            totalInflow: true, provider: { select: { id: true, name: true } },
            taxpayer: { select: { businessName: true, firstName: true, lastName: true, type: true } },
          },
          take: 500,
        })
      : [];

    // Group linkage hits by the OTHER provider + which identifier matched.
    const linkByProvider = new Map<string, any>();
    for (const m of linkMatches) {
      const via = myBvns.includes(m.bvn as any) ? 'BVN' : myNins.includes(m.nin as any) ? 'NIN' : 'ACCOUNT';
      const key = m.provider.id;
      const g = linkByProvider.get(key) ?? {
        providerId: m.provider.id, providerName: m.provider.name,
        inflow: 0, records: 0, via: new Set<string>(),
        otherTaxpayerName: m.taxpayer ? (m.taxpayer.type === 'CORPORATE' ? m.taxpayer.businessName : [m.taxpayer.firstName, m.taxpayer.lastName].filter(Boolean).join(' ')) : null,
        alreadyLinked: myProviderIds.has(m.provider.id),
      };
      g.inflow += Number(m.totalInflow ?? 0);
      g.records += 1;
      g.via.add(via);
      linkByProvider.set(key, g);
    }
    const identityLinks = [...linkByProvider.values()].map((g) => ({ ...g, via: [...g.via] })).sort((a, b) => b.inflow - a.inflow);

    // Distinct identity anchors + the cross-provider consolidated picture.
    const providerInflows = providerBreakdown.map((p) => p.totalInflow);
    const biggestSingle = providerInflows.length ? Math.max(...providerInflows) : 0;
    const combined = providerInflows.reduce((a, b) => a + b, 0);
    const threshold = tp.type === 'CORPORATE' ? cfg.reportingThresholdCorporate : cfg.reportingThresholdIndividual;
    // SPREADER: money split across providers so no single provider hits the
    // threshold, but the consolidated total does.
    const isSpreader = providerBreakdown.length > 1 && biggestSingle < threshold && combined >= threshold;

    const crossIdentity = {
      providerCount: providerBreakdown.length,
      distinctAccounts: new Set(recs.map((r) => r.accountNumber).filter(Boolean)).size,
      distinctBvns: myBvns.length,
      matchMethods: [...new Set(recs.map((r) => r.matchMethod).filter(Boolean))],
      biggestSingleProviderInflow: biggestSingle,
      combinedInflow: combined,
      isSpreader,
      // Same identifier found at other providers (possible unresolved same person).
      identityLinks,
      identityLinkCount: identityLinks.length,
    };

    // ── Cases + AI agent signals (the "AI" narrative) ──
    const cases = await this.prisma.underdeclarationCase.findMany({
      where: { taxpayerId, ...(opts.year ? { year: opts.year } : {}) }, orderBy: { year: 'desc' },
      select: { id: true, year: true, observedIncome: true, declaredIncome: true, discrepancyAmount: true, estimatedTaxDue: true, status: true, riskLevel: true, confidence: true },
    });
    const signals = await this.prisma.riskSignal.findMany({
      where: { taxpayerId, ...(opts.year ? { year: opts.year } : {}) }, orderBy: { score: 'desc' },
      select: { agentKey: true, severity: true, score: true, summary: true, year: true },
    });
    const estimatedRecoverable = cases.reduce((s, c) => s + Number(c.estimatedTaxDue ?? 0), 0);

    // ── Structured AI narrative (deterministic, from the data + agents) ──
    const narrative = this.buildNarrative({
      name, type: tp.type, sector: tp.sector, incomeByYear, totalUndeclared, estimatedRecoverable,
      payeStatus: tp.payeStatus ?? 'UNKNOWN', signalCount: signals.length,
      highSignals: signals.filter((s) => s.severity === 'HIGH').length, taxCards,
      providerCount: crossIdentity.providerCount, distinctAccounts: crossIdentity.distinctAccounts,
      isSpreader: crossIdentity.isSpreader, combined: crossIdentity.combinedInflow,
      biggestSingle: crossIdentity.biggestSingleProviderInflow, identityLinkCount: crossIdentity.identityLinkCount,
    });

    return {
      generatedAt: new Date().toISOString(),
      taxpayer: {
        id: tp.id, name, type: tp.type, sector: tp.sector, status: tp.status,
        tin: this.crypto.decrypt(tp.tinEnc),
        rcNumber: tp.cacRcNumber,
        bvn: this.pii.reveal(this.crypto.decrypt(tp.bvnEnc), 'bvn', clear),
        nin: this.pii.reveal(this.crypto.decrypt(tp.ninEnc), 'nin', clear),
        payeStatus: tp.payeStatus, payeRegNumber: tp.payeRegNumber,
        phone: tp.phone, email: tp.email, address: tp.address,
      },
      income: incomeByYear,
      taxCards,
      crossIdentity,
      providerBreakdown,
      payments: payments.map((p) => ({ taxType: p.taxType, year: p.year, period: p.period, amountPaid: Number(p.amountPaid), reference: p.reference, source: p.source })),
      cases: cases.map((c) => ({ ...c, observedIncome: Number(c.observedIncome), declaredIncome: Number(c.declaredIncome), discrepancyAmount: Number(c.discrepancyAmount ?? 0), estimatedTaxDue: Number(c.estimatedTaxDue ?? 0), confidence: Number(c.confidence ?? 0) })),
      signals,
      totals: { totalUndeclared, estimatedRecoverable, totalTaxPaid: [...paidByType.values()].reduce((a, b) => a + b, 0) },
      narrative,
    };
  }

  private buildNarrative(d: any): string[] {
    const ngn = (v: number) => '₦' + Math.round(v).toLocaleString();
    const out: string[] = [];
    out.push(`${d.name} is a ${String(d.type).toLowerCase()} taxpayer${d.sector ? ` in the ${d.sector} sector` : ''}.`);
    if (d.incomeByYear.length) {
      const y = d.incomeByYear[0];
      out.push(`In ${y.year}, providers reported ${ngn(y.observedIncome)} of observed inflow against ${ngn(y.declaredIncome)} declared — an apparent undeclared amount of ${ngn(y.undeclaredIncome)} (${Math.round(y.discrepancyPct * 100)}%).`);
    }
    if (d.totalUndeclared > 0) out.push(`Across all periods on file, total apparent undeclared income is ${ngn(d.totalUndeclared)}, with an estimated recoverable tax of ${ngn(d.estimatedRecoverable)}.`);
    if (d.providerCount > 1) out.push(`This customer was cross-matched across ${d.providerCount} providers${d.distinctAccounts ? ` and ${d.distinctAccounts} distinct accounts` : ''} — the inflow figure is the consolidated picture, not a single provider's view.`);
    if (d.isSpreader) out.push(`⚠ SPREADER PATTERN: no single provider reported over the reporting threshold (largest ${ngn(d.biggestSingle)}), but the consolidated total across providers is ${ngn(d.combined)} — money appears split to stay under the radar.`);
    if (d.identityLinkCount > 0) out.push(`This customer's identifiers (BVN/NIN/account) also appear in ${d.identityLinkCount} other provider record group(s) that resolved to different taxpayers — possible unresolved same-person activity worth reviewing.`);
    if (d.type === 'CORPORATE') out.push(`PAYE registration status: ${d.payeStatus}.`);
    const paidTypes = d.taxCards.filter((c: any) => c.onFile).map((c: any) => `${c.taxType} ${ngn(c.paid)}`);
    out.push(paidTypes.length ? `Taxes paid on file: ${paidTypes.join(', ')}.` : `No tax payments are on file from the Tax app yet (PAYE/WHT/CGT/CIT).`);
    if (d.signalCount > 0) out.push(`${d.signalCount} AI analytics signal${d.signalCount === 1 ? '' : 's'} (${d.highSignals} high-severity) were raised on this taxpayer.`);
    return out;
  }
}
