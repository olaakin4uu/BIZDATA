import { Body, Controller, ForbiddenException, HttpCode, NotFoundException, Post, Req, UseGuards, BadRequestException } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { StaffAuthGuard } from '../../common/guards/staff-auth.guard';
import { CurrentStaff } from '../../common/decorators/current-staff.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { CryptoService } from '../../common/services/crypto.service';
import { AuditService } from '../../common/services/audit.service';
import { PiiAccessService } from '../../common/services/pii-access.service';

/** Which stored column holds each revealable field, per entity. */
const FIELDS = {
  Taxpayer: { nin: 'ninEnc', bvn: 'bvnEnc' },
  DataRecord: { account: 'accountNumber', bvn: 'bvn', nin: 'nin', phone: 'phoneNumber' },
} as const;
type Entity = keyof typeof FIELDS;

/**
 * Screens receive BVN/NIN/account/phone masked (PII_MASKED_ON_SCREEN). This
 * returns one clear value on request, to a viewer canRevealPii() allows, and
 * records each reveal — which value, of which record, by whom.
 */
@ApiTags('PII')
@ApiBearerAuth()
@UseGuards(StaffAuthGuard)
@Controller('pii')
export class PiiController {
  constructor(
    private prisma: PrismaService,
    private crypto: CryptoService,
    private audit: AuditService,
    private pii: PiiAccessService,
  ) {}

  @Post('reveal')
  @HttpCode(200)
  async reveal(@Body() dto: { entity?: string; id?: string; field?: string }, @CurrentStaff() u: any, @Req() req: Request) {
    const entity = dto?.entity as Entity;
    const column = (FIELDS[entity] as Record<string, string> | undefined)?.[dto?.field ?? ''];
    if (!column || !dto?.id) throw new BadRequestException('Unknown field.');

    if (!(await this.pii.canRevealPii())) {
      await this.audit.log({
        actorType: 'STAFF', actorId: u.id, staffId: u.id,
        action: 'PII_REVEAL_DENIED', entity, entityId: dto.id, afterJson: { field: dto.field },
        ip: req.ip, userAgent: req.headers['user-agent'],
      });
      throw new ForbiddenException('Revealing this value needs an active PII access grant — request one on the Access page.');
    }

    const row: Record<string, string | null> | null = entity === 'Taxpayer'
      ? await this.prisma.taxpayer.findUnique({ where: { id: dto.id }, select: { [column]: true } as any }) as any
      : await this.prisma.dataRecord.findUnique({ where: { id: dto.id }, select: { [column]: true } as any }) as any;
    if (!row) throw new NotFoundException('Record not found.');

    await this.audit.log({
      actorType: 'STAFF', actorId: u.id, staffId: u.id,
      action: 'PII_REVEAL', entity, entityId: dto.id, afterJson: { field: dto.field },
      ip: req.ip, userAgent: req.headers['user-agent'],
    });
    return { value: this.crypto.decrypt(row[column]) };
  }
}
