import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/services/audit.service';

@Injectable()
export class DeclaredIncomeService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  async create(dto: any, actorId?: string) {
    if (!dto.taxpayerId || !dto.year || dto.assessableIncome == null) {
      throw new BadRequestException('taxpayerId, year, assessableIncome required');
    }
    const tp = await this.prisma.taxpayer.findUnique({ where: { id: dto.taxpayerId } });
    if (!tp) throw new NotFoundException('Taxpayer not found');

    const rec = await this.prisma.declaredIncome.upsert({
      where: { taxpayerId_year: { taxpayerId: dto.taxpayerId, year: dto.year } },
      update: {
        assessableIncome: new Prisma.Decimal(dto.assessableIncome),
        source: dto.source,
        notes: dto.notes,
      },
      create: {
        taxpayerId: dto.taxpayerId,
        year: dto.year,
        assessableIncome: new Prisma.Decimal(dto.assessableIncome),
        source: dto.source,
        notes: dto.notes,
      },
    });

    await this.audit.log({
      actorType: 'STAFF',
      actorId,
      staffId: actorId,
      action: 'UPSERT_DECLARED_INCOME',
      entity: 'DeclaredIncome',
      entityId: rec.id,
    });

    return rec;
  }

  async findAll(query: any) {
    const page = Math.max(1, parseInt(query.page || '1', 10));
    const limit = Math.min(200, Math.max(1, parseInt(query.limit || '50', 10)));
    const where: Prisma.DeclaredIncomeWhereInput = {
      ...(query.taxpayerId ? { taxpayerId: query.taxpayerId } : {}),
      ...(query.year ? { year: parseInt(query.year, 10) } : {}),
    };
    const [records, total] = await Promise.all([
      this.prisma.declaredIncome.findMany({
        where,
        include: { taxpayer: { select: { id: true, nin: true, cacRcNumber: true, firstName: true, lastName: true, businessName: true, type: true } } },
        orderBy: [{ year: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.declaredIncome.count({ where }),
    ]);
    return { records, total, page, limit };
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
        const year = parseInt(row.year, 10);
        const income = parseFloat(row.assessableincome);
        if (!year || isNaN(income)) {
          errors.push(`Row ${i + 1}: invalid year/income`);
          skipped++; continue;
        }
        if (!row.taxpayernin && !row.taxpayercacrcnumber) {
          errors.push(`Row ${i + 1}: missing taxpayer identifier`);
          skipped++; continue;
        }

        const tp = await this.prisma.taxpayer.findFirst({
          where: {
            OR: [
              ...(row.taxpayernin ? [{ nin: row.taxpayernin }] : []),
              ...(row.taxpayercacrcnumber ? [{ cacRcNumber: row.taxpayercacrcnumber }] : []),
            ],
          },
          select: { id: true },
        });
        if (!tp) {
          errors.push(`Row ${i + 1}: taxpayer not found`);
          skipped++; continue;
        }

        const existing = await this.prisma.declaredIncome.findUnique({
          where: { taxpayerId_year: { taxpayerId: tp.id, year } },
        });

        if (existing) {
          await this.prisma.declaredIncome.update({
            where: { id: existing.id },
            data: {
              assessableIncome: new Prisma.Decimal(income),
              source: row.source || existing.source,
              notes: row.notes || existing.notes,
            },
          });
          updated++;
        } else {
          await this.prisma.declaredIncome.create({
            data: {
              taxpayerId: tp.id,
              year,
              assessableIncome: new Prisma.Decimal(income),
              source: row.source || 'MANUAL_IMPORT',
              notes: row.notes || null,
            },
          });
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
      action: 'IMPORT_DECLARED_INCOME',
      entity: 'DeclaredIncome',
      afterJson: { created, updated, skipped },
    });

    return { created, updated, skipped, errors: errors.slice(0, 50) };
  }
}
