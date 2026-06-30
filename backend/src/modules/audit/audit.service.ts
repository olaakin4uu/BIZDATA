import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { auditPayload, auditHash } from '../../common/services/audit.service';

@Injectable()
export class AuditQueryService {
  constructor(private prisma: PrismaService) {}

  /**
   * Walk the entire audit log in creation order, recompute each entry's
   * SHA-256 hash from its stored fields, and check both the recomputed hash and
   * the prev-link. Any post-hoc edit/insert/delete breaks the chain and is
   * pinpointed. Demonstrates the §139 tamper-evidence guarantee.
   */
  async verify() {
    const rows = await this.prisma.auditLog.findMany({
      orderBy: { createdAt: 'asc' },
      select: {
        id: true, actorType: true, actorId: true, action: true, entity: true, entityId: true,
        beforeJson: true, afterJson: true, createdAt: true, hashChainPrev: true, hashChainCurr: true,
      },
    });
    let prevHash = '';
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const payload = auditPayload({ ...r, ts: r.createdAt.toISOString() });
      const expected = auditHash(prevHash, payload);
      if ((r.hashChainPrev || '') !== prevHash) {
        return { verified: false, count: rows.length, brokenAt: i + 1, entryId: r.id, reason: 'prev-link mismatch', action: r.action };
      }
      if (r.hashChainCurr !== expected) {
        return { verified: false, count: rows.length, brokenAt: i + 1, entryId: r.id, reason: 'hash mismatch (entry altered)', action: r.action };
      }
      prevHash = r.hashChainCurr!;
    }
    return { verified: true, count: rows.length, headHash: prevHash || null };
  }

  async findAll(query: any) {
    const page = Math.max(1, parseInt(query.page || '1', 10));
    const limit = Math.min(200, Math.max(1, parseInt(query.limit || '50', 10)));
    const where: Prisma.AuditLogWhereInput = {
      ...(query.actorType ? { actorType: query.actorType } : {}),
      ...(query.action ? { action: query.action } : {}),
      ...(query.entity ? { entity: query.entity } : {}),
      ...(query.dateFrom || query.dateTo
        ? {
            createdAt: {
              ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
              ...(query.dateTo ? { lte: new Date(query.dateTo) } : {}),
            },
          }
        : {}),
    };
    const [logs, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        include: { staff: { select: { id: true, firstName: true, lastName: true, email: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return { logs, total, page, limit };
  }

  async findOne(id: string) {
    const log = await this.prisma.auditLog.findUnique({
      where: { id },
      include: { staff: { select: { id: true, firstName: true, lastName: true, email: true } } },
    });
    if (!log) throw new NotFoundException('Log not found');
    return log;
  }
}
