import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/services/audit.service';
import { CryptoService } from '../../common/services/crypto.service';

// Home jurisdiction. States here are treated as "in-FCT"; everything else is a
// cross-state candidate. (Move to tenant config when multi-tenant.)
const HOME_AUTHORITY = 'FCT-IRS';
const HOME_STATES = new Set(['FCT', 'ABUJA', 'FEDERAL CAPITAL TERRITORY']);

@Injectable()
export class CrossStateService {
  constructor(private prisma: PrismaService, private audit: AuditService, private crypto: CryptoService) {}

  private isHome(state?: string | null) {
    return HOME_STATES.has((state || '').trim().toUpperCase());
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
    return cases
      .filter((c) => c.taxpayer && !this.isHome(c.taxpayer.stateOfResidence) && !referred.has(c.taxpayerId))
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
          fromAuthority: HOME_AUTHORITY,
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
        toAuthority: HOME_AUTHORITY,
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
