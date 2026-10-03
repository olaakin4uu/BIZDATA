import { Body, Controller, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { StaffAuthGuard } from '../../common/guards/staff-auth.guard';
import { CurrentStaff } from '../../common/decorators/current-staff.decorator';
import { AuditService } from '../../common/services/audit.service';

/** Client-side security events the browser reports, e.g. a removed viewer watermark. */
export const SECURITY_EVENT_TYPES = ['WATERMARK_TAMPER'] as const;

export function securityEventLog(dto: any) {
  const type = SECURITY_EVENT_TYPES.includes(dto?.type) ? dto.type : 'UNKNOWN';
  const clip = (v: unknown) => (typeof v === 'string' ? v.slice(0, 300) : null);
  return { action: `SECURITY_${type}`, afterJson: { reason: clip(dto?.reason), path: clip(dto?.path) } };
}

// Any signed-in staff member may report against their own session, so this sits
// outside the role-gated AuditController.
@ApiTags('Audit')
@ApiBearerAuth()
@UseGuards(StaffAuthGuard)
@Controller('security-events')
export class SecurityEventsController {
  constructor(private audit: AuditService) {}

  @Post()
  @HttpCode(204)
  async report(@Body() dto: any, @CurrentStaff() u: any, @Req() req: Request) {
    const { action, afterJson } = securityEventLog(dto);
    await this.audit.log({
      actorType: 'STAFF', actorId: u.id, staffId: u.id,
      action, entity: 'Session', afterJson,
      ip: req.ip, userAgent: req.headers['user-agent'],
    });
  }
}
