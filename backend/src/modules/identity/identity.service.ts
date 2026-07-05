import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/services/audit.service';
import { CryptoService } from '../../common/services/crypto.service';
import { IdentityProvider } from './identity-provider.interface';
import { MockIdentityProvider } from './providers/mock-identity.provider';
import { NibssIdentityProvider } from './providers/nibss-identity.provider';

/**
 * Phase 4 — bring "invisible" individuals into the tax net by resolving the BVN
 * we already hold to its linked NIN via the national bridge (NIBSS), then
 * enriching the taxpayer with a verified NIN. This is the only step that draws
 * on an external source; everything downstream (registration, coverage) already
 * exists.
 */
@Injectable()
export class IdentityService {
  private readonly logger = new Logger(IdentityService.name);
  private readonly provider: IdentityProvider;

  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private crypto: CryptoService,
  ) {
    this.provider = this.selectProvider();
    this.logger.log(`Identity provider: ${this.provider.name}`);
  }

  /** Pick the provider from env — mock by default, real NIBSS when configured. */
  private selectProvider(): IdentityProvider {
    const choice = (process.env.IDENTITY_PROVIDER || 'mock').toLowerCase();
    if (choice === 'nibss') {
      return new NibssIdentityProvider({
        baseUrl: process.env.NIBSS_BASE_URL,
        clientId: process.env.NIBSS_CLIENT_ID,
        clientSecret: process.env.NIBSS_CLIENT_SECRET,
      });
    }
    return new MockIdentityProvider();
  }

  /** Provider name + whether it is the production source (for the UI banner). */
  status() {
    return { provider: this.provider.name, isMock: this.provider.name === 'MOCK' };
  }

  /** How many taxpayers can be resolved / are already verified. */
  async resolveStatus() {
    const [resolvable, verified, total] = await Promise.all([
      this.prisma.taxpayer.count({ where: { bvnIndex: { not: null }, ninIndex: null } }),
      this.prisma.taxpayer.count({ where: { identityVerifiedAt: { not: null } } }),
      this.prisma.taxpayer.count(),
    ]);
    return { resolvable, verified, total, provider: this.provider.name, isMock: this.provider.name === 'MOCK' };
  }

  /**
   * Resolve one taxpayer's BVN → NIN and enrich the record. Returns the outcome
   * without exposing the raw NIN unless the caller is entitled (kept minimal here).
   */
  async resolveOne(taxpayerId: string, staffId: string) {
    const tp = await this.prisma.taxpayer.findUnique({ where: { id: taxpayerId } });
    if (!tp) throw new NotFoundException('Taxpayer not found');
    if (tp.ninIndex) throw new BadRequestException('Taxpayer already has a NIN on record.');
    if (!tp.bvnEnc) throw new BadRequestException('No BVN on record to resolve against.');

    const bvn = this.crypto.decrypt(tp.bvnEnc);
    if (!bvn) throw new BadRequestException('Could not read the stored BVN.');

    const match = await this.provider.resolveByBvn(bvn);

    if (match.notFound || !match.nin) {
      await this.audit.log({
        actorType: 'STAFF', actorId: staffId, staffId,
        action: 'IDENTITY_RESOLVE_NOT_FOUND', entity: 'Taxpayer', entityId: taxpayerId,
        afterJson: { source: match.source },
      });
      return { taxpayerId, resolved: false, reason: 'No linked NIN found for this BVN.' };
    }

    // Guard: another taxpayer may already own this NIN.
    const ninIndex = this.crypto.blindIndex(match.nin);
    const clash = await this.prisma.taxpayer.findFirst({ where: { ninIndex, id: { not: taxpayerId } } });
    if (clash) {
      return { taxpayerId, resolved: false, reason: 'The resolved NIN is already linked to another taxpayer.' };
    }

    await this.prisma.taxpayer.update({
      where: { id: taxpayerId },
      data: {
        ninEnc: this.crypto.encrypt(match.nin),
        ninIndex,
        identityVerifiedAt: new Date(),
        identitySource: match.source,
        // Enrich demographics only where we don't already have them.
        ...(match.firstName && !tp.firstName ? { firstName: match.firstName } : {}),
        ...(match.lastName && !tp.lastName ? { lastName: match.lastName } : {}),
        ...(match.dateOfBirth && !tp.dateOfBirth ? { dateOfBirth: new Date(match.dateOfBirth) } : {}),
        ...(match.stateOfOrigin && !tp.stateOfResidence ? { stateOfResidence: match.stateOfOrigin } : {}),
      },
    });

    await this.audit.log({
      actorType: 'STAFF', actorId: staffId, staffId,
      action: 'IDENTITY_RESOLVE', entity: 'Taxpayer', entityId: taxpayerId,
      afterJson: { source: match.source, confidence: match.confidence, ninLinked: true },
    });

    return { taxpayerId, resolved: true, source: match.source, confidence: match.confidence };
  }

  /**
   * Bulk resolve. Runs the BVN→NIN bridge across taxpayers with a BVN but no NIN.
   * Optionally scoped to a list of ids or capped for a controlled run.
   */
  async resolveBulk(staffId: string, opts: { ids?: string[]; limit?: number } = {}) {
    let candidates = await this.prisma.taxpayer.findMany({
      where: { bvnIndex: { not: null }, ninIndex: null, ...(opts.ids?.length ? { id: { in: opts.ids } } : {}) },
      select: { id: true },
    });
    if (opts.limit && opts.limit > 0) candidates = candidates.slice(0, opts.limit);

    let resolved = 0, notFound = 0, skipped = 0;
    for (const c of candidates) {
      try {
        const r = await this.resolveOne(c.id, staffId);
        if (r.resolved) resolved++; else notFound++;
      } catch { skipped++; }
    }

    await this.audit.log({
      actorType: 'STAFF', actorId: staffId, staffId,
      action: 'IDENTITY_RESOLVE_BULK', entity: 'Taxpayer', entityId: 'BATCH',
      afterJson: { source: this.provider.name, candidates: candidates.length, resolved, notFound, skipped },
    });

    return { candidates: candidates.length, resolved, notFound, skipped, provider: this.provider.name };
  }
}
