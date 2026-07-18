import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/services/audit.service';
import { CryptoService } from '../../common/services/crypto.service';

/**
 * PAYE / employer-registration tracking.
 *
 * BIZDATA cannot know PAYE-registration status natively — it lives in the KIRS
 * Tax app. Two ways it arrives:
 *   1. The Tax app pushes it in bulk via POST /integration/paye (matched by
 *      RC number or TIN, exactly like the declared-income integration).
 *   2. A staff member sets it manually on one taxpayer.
 *
 * A CORPORATE taxpayer that is observed earning (has data_records) but whose
 * payeStatus is not 'REGISTERED' is a PAYE-gap lead — surfaced in Tax Net.
 */
@Injectable()
export class PayeService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private crypto: CryptoService,
  ) {}

  // ─── Bulk push from the Tax app (API-key authenticated) ─────────────────────
  async processJson(
    body: any,
    opts: { dryRun?: boolean; partnerName?: string } = {},
  ) {
    const rows: any[] = Array.isArray(body) ? body : Array.isArray(body?.records) ? body.records : null;
    if (!rows) throw new BadRequestException('Body must be a JSON array (or { records: [...] }).');

    const str = (v: any) => (v == null ? undefined : String(v).trim() || undefined);
    const bool = (v: any) => v === true || v === 'true' || v === 1 || v === '1' || v === 'REGISTERED';

    let matched = 0, updated = 0, unmatched = 0;
    const errors: string[] = [];

    for (let i = 0; i < rows.length; i++) {
      const it = rows[i];
      const where = `row ${i + 1}`;
      const rc = str(it?.rcNumber ?? it?.cacRcNumber ?? it?.taxpayerCacRcNumber);
      const tin = str(it?.tin ?? it?.taxpayerTin);
      const payeRegNumber = str(it?.payeRegNumber ?? it?.payeNumber ?? it?.employerRegNumber);
      // Explicit registered flag; default to REGISTERED when a PAYE number is present.
      const registered = it?.registered != null ? bool(it.registered) : !!payeRegNumber;

      if (!rc && !tin) { errors.push(`${where}: needs rcNumber or tin.`); unmatched++; continue; }

      const tp = await this.prisma.taxpayer.findFirst({
        where: {
          OR: [
            ...(rc ? [{ cacRcNumber: rc }] : []),
            ...(tin ? [{ tinIndex: this.crypto.blindIndex(tin)! }] : []),
          ],
        },
        select: { id: true },
      });
      if (!tp) { errors.push(`${where}: no taxpayer matches ${rc ? `RC ${rc}` : `TIN`}.`); unmatched++; continue; }

      matched++;
      if (opts.dryRun) continue;

      await this.prisma.taxpayer.update({
        where: { id: tp.id },
        data: {
          payeStatus: registered ? 'REGISTERED' : 'NOT_REGISTERED',
          payeRegNumber: payeRegNumber ?? undefined,
          payeVerifiedAt: new Date(),
          payeSource: 'TAX_APP_SYNC',
        },
      });
      updated++;
    }

    if (!opts.dryRun) {
      await this.audit.log({
        actorType: 'SYSTEM',
        action: 'SYNC_PAYE',
        entity: 'Taxpayer',
        afterJson: { matched, updated, unmatched, ...(opts.partnerName ? { partner: opts.partnerName } : {}) },
      });
    }

    return { total: rows.length, matched, updated, unmatched, dryRun: !!opts.dryRun, errors: errors.slice(0, 50) };
  }

  // ─── Manual staff override for a single taxpayer ────────────────────────────
  async setManual(
    taxpayerId: string,
    dto: { status: string; payeRegNumber?: string },
    staffId?: string,
  ) {
    const status = String(dto?.status || '').toUpperCase();
    if (!['REGISTERED', 'NOT_REGISTERED', 'UNKNOWN'].includes(status)) {
      throw new BadRequestException('status must be REGISTERED, NOT_REGISTERED or UNKNOWN');
    }
    const tp = await this.prisma.taxpayer.findUnique({ where: { id: taxpayerId }, select: { id: true } });
    if (!tp) throw new NotFoundException('Taxpayer not found');

    const updated = await this.prisma.taxpayer.update({
      where: { id: taxpayerId },
      data: {
        payeStatus: status,
        payeRegNumber: dto.payeRegNumber ?? undefined,
        payeVerifiedAt: new Date(),
        payeSource: 'MANUAL',
      },
      select: { id: true, payeStatus: true, payeRegNumber: true, payeVerifiedAt: true, payeSource: true },
    });

    await this.audit.log({
      actorType: 'STAFF',
      actorId: staffId,
      staffId,
      action: 'SET_PAYE_STATUS',
      entity: 'Taxpayer',
      entityId: taxpayerId,
      afterJson: { status, payeRegNumber: dto.payeRegNumber ?? null },
    });

    return updated;
  }
}
