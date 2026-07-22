import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/services/audit.service';
import { CryptoService } from '../../common/services/crypto.service';
import { ReportableService } from '../../common/services/reportable.service';

/**
 * Tax-net comparative & registration.
 *
 * Classifies every taxpayer we observe receiving money into one of three states,
 * each backed by a truth-of-record identifier:
 *   CAPTURED   — corporate with an RC number, or individual with a TIN (or matched NIN).
 *   UNVERIFIED — in the registry but the anchoring ID is missing/unconfirmed.
 *   INVISIBLE  — observed inflow but no registration at all.
 *
 * Registration assigns a TIN and moves a taxpayer to CAPTURED — either one at a
 * time (manual) or in bulk (auto). Every action is audited.
 */
export type NetStatus = 'CAPTURED' | 'UNVERIFIED' | 'INVISIBLE';

@Injectable()
export class TaxNetService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private crypto: CryptoService,
    private reportable: ReportableService,
  ) {}

  /** Truth-of-record classification for one taxpayer row. */
  private classify(tp: {
    type: string; cacRcNumber: string | null; tinIndex: string | null; ninIndex: string | null;
  }): NetStatus {
    if (tp.type === 'CORPORATE') {
      return tp.cacRcNumber ? 'CAPTURED' : 'UNVERIFIED';
    }
    // Individual: TIN is the tax-net anchor; a matched NIN counts as verifiable.
    if (tp.tinIndex) return 'CAPTURED';
    if (tp.ninIndex) return 'UNVERIFIED'; // has identity but no TIN yet — registerable
    return 'INVISIBLE';
  }

  /**
   * The comparative report. Aggregates observed inflow per taxpayer from data
   * records, classifies each, and returns segment summaries plus a ranked list.
   */
  async report(opts: { status?: NetStatus; type?: string; page?: number; limit?: number; year?: number; payeGap?: boolean } = {}) {
    const page = Math.max(1, opts.page ?? 1);
    const limit = Math.min(200, Math.max(1, opts.limit ?? 50));

    // STATUTORY REPORTING THRESHOLD — Tax Net only concerns parties that are
    // reportable (§29 cumulative monthly inflow >= their type threshold). Below-
    // threshold parties are never shown, however much data was uploaded.
    // Compute this FIRST and scope every subsequent record read to it — the old
    // version aggregated inflow + loaded a distinct taxpayer/provider list across
    // the WHOLE ~2M-row universe before filtering, OOM-crashing the backend.
    const reportableIds = await this.reportable.reportableTaxpayerIds({ year: opts.year });
    const reportableIdList = [...reportableIds];

    // Observed inflow per taxpayer — scoped to reportable taxpayers only.
    const inflowRows = reportableIdList.length === 0 ? [] : await this.prisma.dataRecord.groupBy({
      by: ['taxpayerId'],
      where: {
        taxpayerId: { in: reportableIdList },
        ...(opts.year ? { periodYear: opts.year } : {}),
        // exclude ₦0 account-opening rows so the per-taxpayer "records" count is real
        NOT: { payload: { path: ['recordKind'], equals: 'ACCOUNT_OPENED' } },
      },
      _sum: { totalInflow: true },
      _count: { _all: true },
    });
    const inflowByTp = new Map<string, { inflow: number; records: number }>();
    for (const r of inflowRows) {
      if (r.taxpayerId) inflowByTp.set(r.taxpayerId, {
        inflow: Number(r._sum.totalInflow ?? 0), records: r._count._all,
      });
    }

    // Which provider(s) each taxpayer's data was pulled from — reportable only.
    const provLinks = reportableIdList.length === 0 ? [] : await this.prisma.dataRecord.findMany({
      where: { taxpayerId: { in: reportableIdList }, ...(opts.year ? { periodYear: opts.year } : {}) },
      select: { taxpayerId: true, provider: { select: { name: true } } },
      distinct: ['taxpayerId', 'providerId'],
    });
    const providersByTp = new Map<string, Set<string>>();
    for (const l of provLinks) {
      if (!l.taxpayerId) continue;
      const set = providersByTp.get(l.taxpayerId) ?? new Set<string>();
      if (l.provider?.name) set.add(l.provider.name);
      providersByTp.set(l.taxpayerId, set);
    }

    // Reportable taxpayers only (identity fields — no PII decryption to classify).
    const taxpayers = await this.prisma.taxpayer.findMany({
      where: { id: { in: [...reportableIds] } },
      select: {
        id: true, type: true, status: true, firstName: true, lastName: true,
        businessName: true, cacRcNumber: true, tinIndex: true, ninIndex: true,
        bvnIndex: true, stateOfResidence: true, sector: true,
        payeStatus: true, payeRegNumber: true,
      },
    });

    // Segment summary across ALL taxpayers.
    const summary: Record<NetStatus, { count: number; observedInflow: number }> = {
      CAPTURED: { count: 0, observedInflow: 0 },
      UNVERIFIED: { count: 0, observedInflow: 0 },
      INVISIBLE: { count: 0, observedInflow: 0 },
    };
    const enriched = taxpayers.map((tp) => {
      const net = this.classify(tp);
      const obs = inflowByTp.get(tp.id) ?? { inflow: 0, records: 0 };
      summary[net].count += 1;
      summary[net].observedInflow += obs.inflow;
      const provs = [...(providersByTp.get(tp.id) ?? [])];
      // PAYE gap: a CORPORATE observed earning money that the Tax app has NOT
      // confirmed as PAYE-registered. A strong lead that an employer is off PAYE.
      const payeStatus = tp.payeStatus ?? 'UNKNOWN';
      const payeGap = tp.type === 'CORPORATE' && obs.inflow > 0 && payeStatus !== 'REGISTERED';
      return {
        id: tp.id, type: tp.type, status: tp.status,
        name: tp.type === 'CORPORATE' ? (tp.businessName ?? '—') : [tp.firstName, tp.lastName].filter(Boolean).join(' ') || '—',
        rcNumber: tp.cacRcNumber,
        hasTin: !!tp.tinIndex, hasNin: !!tp.ninIndex, hasBvn: !!tp.bvnIndex,
        stateOfResidence: tp.stateOfResidence, sector: tp.sector,
        netStatus: net, observedInflow: obs.inflow, recordCount: obs.records,
        payeStatus, payeRegNumber: tp.payeRegNumber, payeGap,
        providers: provs,                              // all source providers
        sourceProvider: provs[0] ?? null,              // primary (first) source
        providerCount: provs.length,
      };
    });

    // Filter + rank by observed inflow (biggest first — the enforcement priority).
    let list = enriched;
    if (opts.status) list = list.filter((x) => x.netStatus === opts.status);
    if (opts.type) list = list.filter((x) => x.type === opts.type);
    if (opts.payeGap) list = list.filter((x) => x.payeGap);
    list.sort((a, b) => b.observedInflow - a.observedInflow);

    // PAYE-gap tally across ALL taxpayers (independent of the current filter).
    const payeGapAll = enriched.filter((x) => x.payeGap);
    const payeGapSummary = {
      count: payeGapAll.length,
      observedInflow: payeGapAll.reduce((s, x) => s + x.observedInflow, 0),
    };

    const total = list.length;
    const rows = list.slice((page - 1) * limit, (page - 1) * limit + limit);

    return {
      summary: {
        captured: summary.CAPTURED,
        unverified: summary.UNVERIFIED,
        invisible: summary.INVISIBLE,
        totalTaxpayers: taxpayers.length,
        // coverage = share of taxpayers legitimately in the net
        coveragePct: taxpayers.length ? Math.round((summary.CAPTURED.count / taxpayers.length) * 100) : 0,
        payeGap: payeGapSummary,
      },
      rows, total, page, limit,
    };
  }

  /**
   * Generate a deterministic-looking TIN for a taxpayer. Nigerian TINs are
   * commonly a numeric root with a branch suffix. We derive a stable root from a
   * sequence and format as NNNNNNNNNN-0001. NOT an official FIRS-issued number —
   * flagged as provisional until confirmed against the FIRS registry.
   */
  private async generateTin(): Promise<string> {
    // Use a monotonic counter based on how many provisional TINs already exist.
    const existing = await this.prisma.taxpayer.count({ where: { tinIndex: { not: null } } });
    const root = String(200000000 + existing + 1).padStart(9, '0'); // 9-digit root
    return `${root}-0001`;
  }

  /** Register ONE taxpayer into the net: assign a TIN, mark CAPTURED. */
  async register(taxpayerId: string, staffId: string, opts: { tin?: string } = {}) {
    const tp = await this.prisma.taxpayer.findUnique({ where: { id: taxpayerId } });
    if (!tp) throw new NotFoundException('Taxpayer not found');
    if (tp.tinIndex) throw new BadRequestException('Taxpayer already has a TIN — already in the net.');

    const tin = (opts.tin && opts.tin.trim()) || (await this.generateTin());
    // Uniqueness guard on the blind index.
    const tinIndex = this.crypto.blindIndex(tin);
    const clash = await this.prisma.taxpayer.findFirst({ where: { tinIndex } });
    if (clash) throw new BadRequestException('That TIN is already assigned to another taxpayer.');

    const updated = await this.prisma.taxpayer.update({
      where: { id: taxpayerId },
      data: { tinEnc: this.crypto.encrypt(tin), tinIndex, status: 'ACTIVE' },
    });

    await this.audit.log({
      actorType: 'STAFF', actorId: staffId, staffId,
      action: 'REGISTER_TAXPAYER_TAXNET',
      entity: 'Taxpayer', entityId: taxpayerId,
      afterJson: { tin, mode: opts.tin ? 'manual-tin' : 'auto-tin', provisional: !opts.tin },
    });

    return { id: updated.id, tin, netStatus: 'CAPTURED' as NetStatus };
  }

  /**
   * Auto/bulk register. Assigns a provisional TIN to every currently-registerable
   * taxpayer (INVISIBLE or UNVERIFIED individuals with no TIN). Optionally scoped
   * to a list of ids, a minimum observed inflow, or a cap on how many to process.
   */
  // Hard ceiling on a single auto-register run. This mutates taxpayers (assigns
  // TINs) irreversibly, so a caller that omits ids/limit must NOT be able to
  // sweep the whole ~1.5M-individual universe in one unbounded, un-audited-per-
  // batch mutation. Callers register in explicit, capped batches instead.
  private static readonly AUTO_REGISTER_MAX = 5000;
  private static readonly AUTO_REGISTER_DEFAULT = 1000;

  async autoRegister(staffId: string, opts: { ids?: string[]; minInflow?: number; limit?: number } = {}) {
    // Resolve a bounded cap up front and push it into the query so we never even
    // LOAD more than the cap (the old code loaded every TIN-less individual).
    const cap = Math.min(
      TaxNetService.AUTO_REGISTER_MAX,
      Math.max(1, opts.limit && opts.limit > 0 ? opts.limit : TaxNetService.AUTO_REGISTER_DEFAULT),
    );

    // Candidates: individuals without a TIN (corporates are captured via RC).
    let candidates = await this.prisma.taxpayer.findMany({
      where: {
        type: 'INDIVIDUAL',
        tinIndex: null,
        ...(opts.ids?.length ? { id: { in: opts.ids } } : {}),
      },
      select: { id: true },
      // When a min-inflow gate is set we over-fetch (cap*4) then filter down to
      // cap below; otherwise take exactly the cap.
      take: opts.minInflow && opts.minInflow > 0 ? cap * 4 : cap,
    });

    // Optional min-inflow gate — only register those actually receiving money above a floor.
    if (opts.minInflow && opts.minInflow > 0) {
      const inflow = await this.prisma.dataRecord.groupBy({
        by: ['taxpayerId'],
        where: { taxpayerId: { in: candidates.map((c) => c.id) } },
        _sum: { totalInflow: true },
      });
      const ok = new Set(inflow.filter((r) => Number(r._sum.totalInflow ?? 0) >= opts.minInflow!).map((r) => r.taxpayerId!));
      candidates = candidates.filter((c) => ok.has(c.id));
    }

    // Final hard cap regardless of path.
    candidates = candidates.slice(0, cap);

    let registered = 0;
    const assigned: { id: string; tin: string }[] = [];
    for (const c of candidates) {
      try {
        const r = await this.register(c.id, staffId, {}); // audits each individually
        assigned.push({ id: r.id, tin: r.tin });
        registered += 1;
      } catch { /* skip clashes/races */ }
    }

    await this.audit.log({
      actorType: 'STAFF', actorId: staffId, staffId,
      action: 'AUTO_REGISTER_TAXNET',
      entity: 'Taxpayer', entityId: 'BATCH',
      afterJson: { registered, minInflow: opts.minInflow ?? null, scopedIds: opts.ids?.length ?? null },
    });

    return { registered, candidates: candidates.length, assigned };
  }
}
