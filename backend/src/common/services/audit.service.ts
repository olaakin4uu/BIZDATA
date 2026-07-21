import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';

export interface AuditLogOptions {
  actorType: 'STAFF' | 'PROVIDER_USER' | 'SYSTEM';
  actorId?: string;
  staffId?: string;
  action: string;
  entity: string;
  entityId?: string;
  beforeJson?: any;
  afterJson?: any;
  ip?: string;
  userAgent?: string;
}

/** Deterministic JSON with recursively sorted keys — so a Postgres jsonb
 *  round-trip (which reorders keys) still hashes identically.
 *
 *  A Date must serialize to its ISO string here, because that is exactly what
 *  jsonb stores it as. Without this, a caller passing a live `Date` in
 *  before/afterJson hashes it as `{}` at write time (a Date has no enumerable
 *  own keys) but reads back as the ISO string at verify time — a hash mismatch
 *  that falsely reports the whole chain as tampered. Match the stored form. */
export function stableStringify(v: any): string {
  if (v === null || v === undefined) return 'null';
  if (v instanceof Date) return JSON.stringify(v.toISOString());
  if (typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']';
  const keys = Object.keys(v).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + stableStringify(v[k])).join(',') + '}';
}

/** The exact string that is hashed for an entry. Reproducible at verification
 *  time purely from stored fields (ts = the stored createdAt). */
export function auditPayload(e: {
  actorType: string; actorId?: string | null; action: string; entity: string;
  entityId?: string | null; beforeJson?: any; afterJson?: any; ts: string;
}): string {
  return stableStringify({
    actorType: e.actorType,
    actorId: e.actorId ?? null,
    action: e.action,
    entity: e.entity,
    entityId: e.entityId ?? null,
    beforeJson: e.beforeJson ?? null,
    afterJson: e.afterJson ?? null,
    ts: e.ts,
  });
}

export function auditHash(prevHash: string, payload: string): string {
  return createHash('sha256').update(prevHash + payload).digest('hex');
}

@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}

  async log(opts: AuditLogOptions) {
    try {
      const prev = await this.prisma.auditLog.findFirst({
        orderBy: { createdAt: 'desc' },
        select: { hashChainCurr: true },
      });
      const prevHash = prev?.hashChainCurr || '';

      // Stamp our own timestamp so the hash can be reproduced from stored data.
      const ts = new Date();
      const payload = auditPayload({
        actorType: opts.actorType,
        actorId: opts.actorId ?? null,
        action: opts.action,
        entity: opts.entity,
        entityId: opts.entityId ?? null,
        beforeJson: opts.beforeJson ?? null,
        afterJson: opts.afterJson ?? null,
        ts: ts.toISOString(),
      });
      const hashChainCurr = auditHash(prevHash, payload);

      await this.prisma.auditLog.create({
        data: {
          actorType: opts.actorType,
          actorId: opts.actorId,
          staffId: opts.staffId,
          action: opts.action,
          entity: opts.entity,
          entityId: opts.entityId,
          beforeJson: opts.beforeJson ?? undefined,
          afterJson: opts.afterJson ?? undefined,
          ip: opts.ip,
          userAgent: opts.userAgent,
          createdAt: ts,
          hashChainPrev: prevHash || null,
          hashChainCurr,
        },
      });
    } catch (err) {
      // Audit failure must not break the request
      // eslint-disable-next-line no-console
      console.error('Audit log error:', (err as Error).message);
    }
  }
}
