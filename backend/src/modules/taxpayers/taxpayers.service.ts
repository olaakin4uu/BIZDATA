import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/services/audit.service';
import { CryptoService } from '../../common/services/crypto.service';
import { PiiAccessService } from '../../common/services/pii-access.service';

@Injectable()
export class TaxpayersService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private crypto: CryptoService,
    private pii: PiiAccessService,
  ) {}

  /** Build the encrypted-storage + blind-index columns from plaintext identifiers. */
  private encodeIdentifiers(src: { nin?: string | null; bvn?: string | null; tin?: string | null }) {
    return {
      ninEnc: this.crypto.encrypt(src.nin),
      ninIndex: this.crypto.blindIndex(src.nin),
      bvnEnc: this.crypto.encrypt(src.bvn),
      bvnIndex: this.crypto.blindIndex(src.bvn),
      tinEnc: this.crypto.encrypt(src.tin),
      tinIndex: this.crypto.blindIndex(src.tin),
    };
  }

  /**
   * Decrypt identifier ciphertext back into nin/bvn/tin. BVN and NIN are masked
   * unless the viewer is allowed to see PII in the clear (role + JIT elevation);
   * TIN is the working tax id and is always shown.
   */
  decryptOut<T extends { ninEnc?: string | null; bvnEnc?: string | null; tinEnc?: string | null }>(tp: T, allowClear: boolean) {
    if (!tp) return tp;
    return {
      ...tp,
      nin: this.pii.reveal(this.crypto.decrypt(tp.ninEnc), 'nin', allowClear),
      bvn: this.pii.reveal(this.crypto.decrypt(tp.bvnEnc), 'bvn', allowClear),
      tin: this.crypto.decrypt(tp.tinEnc),
    };
  }

  async create(dto: any, actorId?: string) {
    if (!dto.type) throw new BadRequestException('type required');
    if (!dto.nin && !dto.cacRcNumber) {
      throw new BadRequestException('At least one of nin / cacRcNumber required');
    }
    const tp = await this.prisma.taxpayer.create({
      data: {
        ...this.encodeIdentifiers(dto),
        cacRcNumber: dto.cacRcNumber || null,
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

    return this.decryptOut(tp, await this.pii.canRevealPii());
  }

  async findAll(query: any) {
    const page = Math.max(1, parseInt(query.page || '1', 10));
    const limit = Math.min(200, Math.max(1, parseInt(query.limit || '50', 10)));
    const search = (query.search || '').trim();
    // NIN/TIN are encrypted, so they can only be matched EXACTLY via blind index
    // (no partial/contains). Names and CAC number remain free-text searchable.
    const idIndex = this.crypto.blindIndex(search);
    const where: Prisma.TaxpayerWhereInput = {
      ...(query.type ? { type: query.type } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(search
        ? {
            OR: [
              ...(idIndex ? [{ ninIndex: idIndex }, { tinIndex: idIndex }, { bvnIndex: idIndex }] : []),
              { cacRcNumber: { contains: search } },
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

    const clear = await this.pii.canRevealPii();
    return { taxpayers: taxpayers.map((t) => this.decryptOut(t, clear)), total, page, limit };
  }

  async findOne(id: string) {
    const tp = await this.prisma.taxpayer.findUnique({
      where: { id },
      include: {
        declaredIncomes: { orderBy: { year: 'desc' } },
      },
    });
    if (!tp) throw new NotFoundException('Taxpayer not found');
    return this.decryptOut(tp, await this.pii.canRevealPii());
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
        ...(dto.tin !== undefined ? { tinEnc: this.crypto.encrypt(dto.tin), tinIndex: this.crypto.blindIndex(dto.tin) } : {}),
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

    return this.decryptOut(tp, await this.pii.canRevealPii());
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
          ...this.encodeIdentifiers({ nin: row.nin, tin: row.tin }),
          cacRcNumber: row.cacrcnumber || null,
          type: type as any,
          firstName: row.firstname || null,
          lastName: row.lastname || null,
          businessName: row.businessname || null,
          phone: row.phone || null,
          email: row.email || null,
          stateOfResidence: row.stateofresidence || null,
        };

        const ninIndex = this.crypto.blindIndex(row.nin);
        const existing = await this.prisma.taxpayer.findFirst({
          where: {
            OR: [
              ...(ninIndex ? [{ ninIndex }] : []),
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
