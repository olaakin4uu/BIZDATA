import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AuditQueryService {
  constructor(private prisma: PrismaService) {}

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
