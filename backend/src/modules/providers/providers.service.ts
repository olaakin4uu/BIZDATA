import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/services/audit.service';

@Injectable()
export class ProvidersService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  async create(dto: any, actorId?: string) {
    if (!dto.providerCode || !dto.name || !dto.providerType) {
      throw new BadRequestException('providerCode, name, providerType required');
    }
    const provider = await this.prisma.dataProvider.create({
      data: {
        providerCode: dto.providerCode,
        name: dto.name,
        providerType: dto.providerType,
        contactEmail: dto.contactEmail,
        contactPhone: dto.contactPhone,
        address: dto.address,
        reportingFrequency: dto.reportingFrequency || 'QUARTERLY',
        status: dto.status || 'PENDING_ONBOARDING',
      },
    });

    await this.audit.log({
      actorType: 'STAFF',
      actorId,
      staffId: actorId,
      action: 'CREATE_PROVIDER',
      entity: 'DataProvider',
      entityId: provider.id,
      afterJson: { code: provider.providerCode, type: provider.providerType },
    });

    return provider;
  }

  async findAll(query: any) {
    const page = Math.max(1, parseInt(query.page || '1', 10));
    const limit = Math.min(200, Math.max(1, parseInt(query.limit || '50', 10)));
    const search = (query.search || '').trim();

    const where: Prisma.DataProviderWhereInput = {
      ...(query.providerType ? { providerType: query.providerType } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' as any } },
              { providerCode: { contains: search, mode: 'insensitive' as any } },
            ],
          }
        : {}),
    };

    const [providers, total] = await Promise.all([
      this.prisma.dataProvider.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.dataProvider.count({ where }),
    ]);

    return { providers, total, page, limit };
  }

  async stats() {
    const [byType, byStatus, total] = await Promise.all([
      this.prisma.dataProvider.groupBy({ by: ['providerType'], _count: { _all: true } }),
      this.prisma.dataProvider.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.dataProvider.count(),
    ]);
    return {
      total,
      byType: byType.map(r => ({ providerType: r.providerType, count: r._count._all })),
      byStatus: byStatus.map(r => ({ status: r.status, count: r._count._all })),
    };
  }

  async findOne(id: string) {
    const provider = await this.prisma.dataProvider.findUnique({
      where: { id },
      include: {
        users: { select: { id: true, email: true, firstName: true, lastName: true, role: true, isActive: true } },
        submissions: { take: 10, orderBy: { createdAt: 'desc' } },
      },
    });
    if (!provider) throw new NotFoundException('Provider not found');
    return provider;
  }

  async update(id: string, dto: any, actorId?: string) {
    const before = await this.prisma.dataProvider.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Provider not found');

    const provider = await this.prisma.dataProvider.update({
      where: { id },
      data: {
        name: dto.name ?? undefined,
        contactEmail: dto.contactEmail ?? undefined,
        contactPhone: dto.contactPhone ?? undefined,
        address: dto.address ?? undefined,
        reportingFrequency: dto.reportingFrequency ?? undefined,
        status: dto.status ?? undefined,
      },
    });

    await this.audit.log({
      actorType: 'STAFF',
      actorId,
      staffId: actorId,
      action: 'UPDATE_PROVIDER',
      entity: 'DataProvider',
      entityId: id,
    });

    return provider;
  }

  async updateStatus(id: string, status: string, actorId?: string) {
    if (!['ACTIVE', 'SUSPENDED', 'PENDING_ONBOARDING'].includes(status)) {
      throw new BadRequestException('Invalid status');
    }
    const provider = await this.prisma.dataProvider.update({
      where: { id },
      data: { status: status as any },
    });

    await this.audit.log({
      actorType: 'STAFF',
      actorId,
      staffId: actorId,
      action: 'UPDATE_PROVIDER_STATUS',
      entity: 'DataProvider',
      entityId: id,
      afterJson: { status },
    });

    return provider;
  }
}
