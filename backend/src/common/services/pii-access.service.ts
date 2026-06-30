import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RequestContextService } from './request-context.service';
import { AuditService } from './audit.service';

export type PiiFieldType = 'bvn' | 'account' | 'nin';

/**
 * Decides whether the current viewer may see sensitive PII (BVN, full account
 * number, NIN) in the clear, and masks it otherwise. Implements the §5.3 access
 * model:
 *   - ANALYST / READONLY        → never (de-identified data only)
 *   - SUPER_ADMIN               → always (system owner)
 *   - AUDIT_OFFICER / SUPERVISOR / ADMIN / DPO → only with an ACTIVE JIT grant
 */
@Injectable()
export class PiiAccessService {
  constructor(
    private prisma: PrismaService,
    private ctx: RequestContextService,
    private audit: AuditService,
  ) {}

  private static readonly NEVER = new Set(['ANALYST', 'READONLY']);
  private static readonly ALWAYS = new Set(['SUPER_ADMIN']);

  /** Resolve once per read operation, then pass the boolean into mask helpers. */
  async canRevealPii(): Promise<boolean> {
    const role = this.ctx.role;
    const staffId = this.ctx.staffId;
    if (!role || !staffId) return false;
    if (PiiAccessService.ALWAYS.has(role)) return true;
    if (PiiAccessService.NEVER.has(role)) return false;
    const elevated = await this.hasActiveElevation(staffId);
    // §5.3: log each request in which a JIT elevation is used to reveal PII (once).
    if (elevated) {
      const store = this.ctx.get();
      if (store && !store.piiLogged) {
        store.piiLogged = true;
        await this.audit.log({
          actorType: 'STAFF', actorId: staffId, staffId,
          action: 'PII_ACCESS', entity: 'PII', ip: store.ip,
          afterJson: { role, via: 'JIT_ELEVATION' },
        });
      }
    }
    return elevated;
  }

  /** True when the staff member holds an unexpired, approved PII elevation. */
  async hasActiveElevation(staffId: string): Promise<boolean> {
    const grant = await this.prisma.accessElevation.findFirst({
      where: { staffId, scope: 'PII', status: 'ACTIVE', expiresAt: { gt: new Date() } },
      select: { id: true },
    });
    return !!grant;
  }

  /** Mask a sensitive value, preserving a few trailing characters for reference. */
  mask(value: string | null | undefined, type: PiiFieldType): string | null {
    if (value == null || value === '') return value ?? null;
    const keep = type === 'account' ? 4 : 3;
    if (value.length <= keep) return '•'.repeat(value.length);
    return '•'.repeat(value.length - keep) + value.slice(-keep);
  }

  /** Decrypted-or-masked: apply masking unless the caller resolved reveal=true. */
  reveal(plain: string | null | undefined, type: PiiFieldType, allowClear: boolean): string | null {
    if (plain == null) return null;
    return allowClear ? plain : this.mask(plain, type);
  }
}
