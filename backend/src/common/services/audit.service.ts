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

@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}

  async log(opts: AuditLogOptions) {
    try {
      // Fetch the latest audit log entry for hash chain
      const prev = await this.prisma.auditLog.findFirst({
        orderBy: { createdAt: 'desc' },
        select: { hashChainCurr: true },
      });
      const prevHash = prev?.hashChainCurr || '';

      const payload = JSON.stringify({
        actorType: opts.actorType,
        actorId: opts.actorId,
        action: opts.action,
        entity: opts.entity,
        entityId: opts.entityId,
        beforeJson: opts.beforeJson,
        afterJson: opts.afterJson,
        ts: Date.now(),
      });

      const hashChainCurr = createHash('sha256')
        .update(prevHash + payload)
        .digest('hex');

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
