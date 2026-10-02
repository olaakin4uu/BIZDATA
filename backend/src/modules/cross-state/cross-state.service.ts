import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/services/audit.service';
import { CryptoService } from '../../common/services/crypto.service';

// Fallback home jurisdiction, used only when the tenant has not set one. This was
// previously hardcoded, which meant every taxpayer of any authority other than
// FCT-IRS was treated as a non-resident and offered up for §15 referral — an
// authority was invited to refer its own residents to itself.
const FALLBACK_HOME_AUTHORITY = 'FCT-IRS';
const FALLBACK_HOME_STATES = ['FCT', 'ABUJA', 'FEDERAL CAPITAL TERRITORY'];
const FALLBACK_TERRITORY_LABEL = 'FCT';

@Injectable()
export class CrossStateService {
  constructor(private prisma: PrismaService, private audit: AuditService, private crypto: CryptoService) {}

  // Read once per short window: the tenant row changes rarely and this is on the
  // path of every candidate listing.
  private homeCache?: { at: number; authority: string; states: Set<string>; label: string };
  private static readonly HOME_TTL_MS = 60_000;

  /** The tenant's own jurisdiction — who counts as a resident, and what to call it. */
  private async home() {
    const hit = this.homeCache;
    if (hit && Date.now() - hit.at < CrossStateService.HOME_TTL_MS) return hit;
    const t = await this.prisma.tenant.findFirst({
      select: { homeAuthority: true, homeStates: true, homeTerritoryLabel: true, shortName: true },
    });
    const states: string[] = t?.homeStates?.length ? t.homeStates : FALLBACK_HOME_STATES;
    const resolved = {
      at: Date.now(),
      authority: t?.homeAuthority || FALLBACK_HOME_AUTHORITY,
      states: new Set(states.map((s) => s.trim().toUpperCase())),
      label: t?.homeTerritoryLabel || states[0] || FALLBACK_TERRITORY_LABEL,
    };
    this.homeCache = resolved;
    return resolved;
  }

  private isHomeState(state: string | null | undefined, states: Set<string>) {
    return states.has((state || '').trim().toUpperCase());
  }
  private authorityFor(state: string) {
    return `${state} State IRS`;
  }

  /** Flagged taxpayers resident outside FCT — candidates for JRB §15 referral. */
  async candidates(year: number) {
    const cases = await this.prisma.underdeclarationCase.findMany({
      where: { year },
      include: { taxpayer: { select: { id: true, stateOfResidence: true, businessName: true, firstName: true, lastName: true, type: true } } },
      orderBy: { estimatedTaxDue: 'desc' },
    });
    const existing = await this.prisma.crossStateReferral.findMany({
      where: { direction: 'OUTBOUND', year },
      select: { taxpayerId: true },
    });
    const referred = new Set(existing.map((r) => r.taxpayerId));
    const home = await this.home();
    return cases
      .filter((c) => c.taxpayer && !this.isHomeState(c.taxpayer.stateOfResidence, home.states) && !referred.has(c.taxpayerId))
      .map((c) => ({
        caseId: c.id,
        taxpayerId: c.taxpayerId,
        name: c.taxpayer!.businessName || [c.taxpayer!.firstName, c.taxpayer!.lastName].filter(Boolean).join(' ') || 'Unknown',
        state: c.taxpayer!.stateOfResidence,
        toAuthority: this.authorityFor(c.taxpayer!.stateOfResidence || 'Unknown'),
        estimatedTaxDue: Number(c.estimatedTaxDue),
      }));
  }

  /** Create minimised OUTBOUND referrals for all current candidates (DRAFT). */
  async generate(year: number, staffId?: string) {
    const candidates = await this.candidates(year);
    let created = 0;
    for (const cand of candidates) {
      const c = await this.prisma.underdeclarationCase.findFirst({
        where: { taxpayerId: cand.taxpayerId!, year },
        include: { taxpayer: { select: { tinEnc: true } } },
      });
      if (!c) continue;
      // Data-minimised payload: TIN + amounts + case ref only (no BVN/account/NIN).
      const payload = {
        tin: this.crypto.decrypt(c.taxpayer?.tinEnc),
        name: cand.name,
        state: cand.state,
        observedIncome: Number(c.observedIncome),
        estimatedTaxDue: Number(c.estimatedTaxDue),
        demandNoticeRef: c.demandNoticeRef ?? null,
        year,
      };
      await this.prisma.crossStateReferral.create({
        data: {
          taxpayerId: cand.taxpayerId,
          direction: 'OUTBOUND',
          fromAuthority: (await this.home()).authority,
          toAuthority: cand.toAuthority,
          state: cand.state || 'Unknown',
          year,
          payload: payload as any,
          status: 'DRAFT',
          createdById: staffId,
        },
      });
      created++;
    }
    await this.audit.log({
      actorType: staffId ? 'STAFF' : 'SYSTEM', actorId: staffId, staffId,
      action: 'CROSS_STATE_GENERATE', entity: 'CrossStateReferral',
      afterJson: { year, created },
    });
    return { created };
  }

  /** Mark a referral as sent to the partner authority via the JRB. */
  async send(id: string, staffId?: string) {
    const r = await this.prisma.crossStateReferral.update({ where: { id }, data: { status: 'SENT' } });
    await this.audit.log({
      actorType: 'STAFF', actorId: staffId, staffId,
      action: 'CROSS_STATE_SEND', entity: 'CrossStateReferral', entityId: id,
      afterJson: { toAuthority: r.toAuthority },
    });
    return r;
  }

  /** Mark several DRAFT outbound referrals as sent in one action. Anything not a DRAFT outbound is skipped. */
  async sendMany(ids: string[], staffId?: string) {
    const drafts = await this.prisma.crossStateReferral.findMany({
      where: { id: { in: ids ?? [] }, direction: 'OUTBOUND', status: 'DRAFT' },
      select: { id: true, toAuthority: true },
    });
    if (!drafts.length) return { sent: 0 };
    await this.prisma.crossStateReferral.updateMany({
      where: { id: { in: drafts.map((d) => d.id) }, status: 'DRAFT' },
      data: { status: 'SENT' },
    });
    for (const d of drafts) {
      await this.audit.log({
        actorType: 'STAFF', actorId: staffId, staffId,
        action: 'CROSS_STATE_SEND', entity: 'CrossStateReferral', entityId: d.id,
        afterJson: { toAuthority: d.toAuthority, batch: true },
      });
    }
    return { sent: drafts.length };
  }

  /** Accept an INBOUND referral about a taxpayer transacting in/from another state. */
  async inbound(dto: { fromAuthority: string; tin?: string; name?: string; state?: string; summary?: any }, staffId?: string) {
    // Try to link to a known taxpayer by TIN blind index.
    let taxpayerId: string | null = null;
    if (dto.tin) {
      const t = await this.prisma.taxpayer.findFirst({ where: { tinIndex: this.crypto.blindIndex(dto.tin)! }, select: { id: true } });
      taxpayerId = t?.id ?? null;
    }
    const r = await this.prisma.crossStateReferral.create({
      data: {
        taxpayerId,
        direction: 'INBOUND',
        fromAuthority: dto.fromAuthority,
        toAuthority: (await this.home()).authority,
        state: dto.state || 'Unknown',
        year: dto.summary?.year ?? null,
        payload: { name: dto.name, ...dto.summary } as any,
        status: 'RECEIVED',
      },
    });
    await this.audit.log({
      actorType: staffId ? 'STAFF' : 'SYSTEM', actorId: staffId, staffId,
      action: 'CROSS_STATE_INBOUND', entity: 'CrossStateReferral', entityId: r.id,
      afterJson: { fromAuthority: dto.fromAuthority, linked: !!taxpayerId },
    });
    return r;
  }

  async list(query: { direction?: string; status?: string } = {}) {
    const where: Prisma.CrossStateReferralWhereInput = {
      ...(query.direction ? { direction: query.direction as any } : {}),
      ...(query.status ? { status: query.status as any } : {}),
    };
    return this.prisma.crossStateReferral.findMany({ where, orderBy: { createdAt: 'desc' }, take: 200 });
  }
}
