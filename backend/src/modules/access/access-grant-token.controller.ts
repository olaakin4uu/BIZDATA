import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { AccessGrantTokenService } from './access-grant-token.service';
import { StaffAuthGuard } from '../../common/guards/staff-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentStaff } from '../../common/decorators/current-staff.decorator';

/**
 * Four-eyes grant tokens for raw-record access. Requesting/redeeming is done by
 * the assigned officer (SUPER_ADMIN/ADMIN); approving is SUPER_ADMIN-only and
 * cannot be self-approval (enforced in the service).
 */
@ApiTags('Access')
@ApiBearerAuth()
@UseGuards(StaffAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN', 'ADMIN')
@Controller('access/grant-tokens')
export class AccessGrantTokenController {
  constructor(private service: AccessGrantTokenService) {}

  /** Officer requests access to a provider/case they are assigned to. */
  @Post('request')
  @ApiOperation({ summary: 'Request a four-eyes access token (reason required)' })
  request(@CurrentStaff() u: any, @Body() dto: { providerId?: string; caseId?: string; reason?: string }) {
    return this.service.request({ id: u.id, role: u.role }, dto);
  }

  /** SUPER_ADMIN approves — returns the raw one-time token to relay. */
  @Post(':id/approve')
  @Roles('SUPER_ADMIN')
  @ApiOperation({ summary: 'Approve a request (SUPER_ADMIN, not self) — mints + emails the token' })
  approve(@CurrentStaff() u: any, @Param('id') id: string) {
    return this.service.approve({ id: u.id, role: u.role }, id);
  }

  /** Officer redeems password + token to open the access session. */
  @Post('redeem')
  @ApiOperation({ summary: 'Redeem password + token to unlock (starts the work session)' })
  redeem(@CurrentStaff() u: any, @Body() dto: { providerId?: string; caseId?: string; token?: string; password?: string }) {
    return this.service.redeem({ id: u.id, role: u.role }, dto);
  }

  /** Revoke a grant/request (immediate). */
  @Post(':id/revoke')
  revoke(@CurrentStaff() u: any, @Param('id') id: string) {
    return this.service.revoke({ id: u.id, role: u.role }, id);
  }

  /** Pending requests awaiting a Super Admin decision. */
  @Get('pending')
  @Roles('SUPER_ADMIN')
  pending() {
    return this.service.pending();
  }

  /** The current officer's own grants + statuses. */
  @Get('me')
  mine(@CurrentStaff() u: any) {
    return this.service.mine(u.id);
  }
}
