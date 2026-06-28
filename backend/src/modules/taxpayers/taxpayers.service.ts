import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/services/audit.service';

@Injectable()
export class TaxpayersService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  async create(dto: any, actorId?: string) {
    if (!dto.type) throw new BadRequestException('type required');
    if (!dto.nin && !dto.cacRcNumber) {
      throw new BadRequestException('At least one of nin / cacRcNumber required');
    }
    const tp = await this.prisma.taxpayer.create({
      data: {
        nin: dto.nin || null,
        cacRcNumber: dto.cacRcNumber || null,
        tin: dto.tin || null,
        type: dto.type,
        status: dto.status || 'ACTIVE',
        firstName: dto.firstName,
        lastName: dto.lastName,
        middleName: dto.middleName,
        businessName: dto.businessName,
        phone: dto.phone,
        email: dto.email,
        address: dto.address,
        stateOfResidence: dto.stateOfResidence,
      },
    });

    await this.audit.log({
      actorType: 'STAFF',
      actorId,
      staffId: actorId,
      action: 'CREATE_TAXPAYER',
      entity: 'Taxpayer',
      entityId: tp.id,
    });

    return tp;
  }

  async findAll(query: any) {
    const page = Math.max(1, parseInt(query.page || '1', 10));
    const limit = Math.min(200, Math.max(1, parseInt(query.limit || '50', 10)));
    const search = (query.search || '').trim();
    const where: Prisma.TaxpayerWhereInput = {
      ...(query.type ? { type: query.type } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(search
        ? {
            OR: [
              { nin: { contains: search } },
              { cacRcNumber: { contains: search } },
              { tin: { contains: search } },
              { firstName: { contains: search, mode: 'insensitive' as any } },
              { lastName: { contains: search, mode: 'insensitive' as any } },
              { businessName: { contains: search, mode: 'insensitive' as any } },
            ],
          }
        : {}),
    };

    const [taxpayers, total] = await Promise.all([
      this.prisma.taxpayer.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.taxpayer.count({ where }),
    ]);

    return { taxpayers, total, page, limit };
  }

  async findOne(id: string) {
    const tp = await this.prisma.taxpayer.findUnique({
      where: { id },
      include: {
        declaredIncomes: { orderBy: { year: 'desc' } },
      },
    });
    if (!tp) throw new NotFoundException('Taxpayer not found');
    return tp;
  }

  async update(id: string, dto: any, actorId?: string) {
    const before = await this.prisma.taxpayer.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Taxpayer not found');
    const tp = await this.prisma.taxpayer.update({
      where: { id },
      data: {
        firstName: dto.firstName ?? undefined,
        lastName: dto.lastName ?? undefined,
        middleName: dto.middleName ?? undefined,
        businessName: dto.businessName ?? undefined,
        phone: dto.phone ?? undefined,
        email: dto.email ?? undefined,
        address: dto.address ?? undefined,
        stateOfResidence: dto.stateOfResidence ?? undefined,
        tin: dto.tin ?? undefined,
        status: dto.status ?? undefined,
      },
    });

    await this.audit.log({
      actorType: 'STAFF',
      actorId,
      staffId: actorId,
      action: 'UPDATE_TAXPAYER',
      entity: 'Taxpayer',
      entityId: id,
    });

    return tp;
  }

  async importCsv(csvText: string, actorId?: string) {
    const lines = csvText.trim().split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length < 2) throw new BadRequestException('CSV needs header + 1 data row');
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());

    let created = 0, updated = 0, skipped = 0;
    const errors: string[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
      const row: any = {};
      headers.forEach((h, idx) => { row[h] = values[idx] || ''; });

      try {
        if (!row.nin && !row.cacrcnumber) {
          errors.push(`Row ${i + 1}: missing nin/cacRcNumber`);
          skipped++; continue;
        }
        const type = (row.type || 'INDIVIDUAL').toUpperCase();
        if (!['INDIVIDUAL', 'CORPORATE', 'GOVERNMENT'].includes(type)) {
          errors.push(`Row ${i + 1}: invalid type ${row.type}`);
          skipped++; continue;
        }

        const data = {
          nin: row.nin || null,
          cacRcNumber: row.cacrcnumber || null,
          tin: row.tin || null,
          type: type as any,
          firstName: row.firstname || null,
          lastName: row.lastname || null,
          businessName: row.businessname || null,
          phone: row.phone || null,
          email: row.email || null,
          stateOfResidence: row.stateofresidence || null,
        };

        const existing = await this.prisma.taxpayer.findFirst({
          where: {
            OR: [
              ...(row.nin ? [{ nin: row.nin }] : []),
              ...(row.cacrcnumber ? [{ cacRcNumber: row.cacrcnumber }] : []),
            ],
          },
        });

        if (existing) {
          await this.prisma.taxpayer.update({ where: { id: existing.id }, data });
          updated++;
        } else {
          await this.prisma.taxpayer.create({ data });
          created++;
        }
      } catch (err: any) {
        errors.push(`Row ${i + 1}: ${err.message}`);
        skipped++;
      }
    }

    await this.audit.log({
      actorType: 'STAFF',
      actorId,
      staffId: actorId,
      action: 'IMPORT_TAXPAYERS',
      entity: 'Taxpayer',
      afterJson: { created, updated, skipped },
    });

    return { created, updated, skipped, errors: errors.slice(0, 50) };
  }
}
