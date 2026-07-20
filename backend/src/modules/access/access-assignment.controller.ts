import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { AccessAssignmentService } from './access-assignment.service';
import { StaffAuthGuard } from '../../common/guards/staff-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentStaff } from '../../common/decorators/current-staff.decorator';

/**
 * Manage need-to-know access assignments (raw taxpayer records). SUPER_ADMIN /
 * ADMIN only. Self-assign is a grant where the target is the caller.
 */
@ApiTags('Access')
@ApiBearerAuth()
@UseGuards(StaffAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN', 'ADMIN')
@Controller('access/assignments')
export class AccessAssignmentController {
  constructor(private service: AccessAssignmentService) {}

  /** The current officer's active assignments (what they can access). */
  @Get('me')
  mine(@CurrentStaff() u: any) {
    return this.service.mine(u.id);
  }

  /** Admin: list assignments, optionally filtered. */
  @Get()
  list(
    @Query('staffId') staffId?: string,
    @Query('providerId') providerId?: string,
    @Query('caseId') caseId?: string,
    @Query('includeRevoked') includeRevoked?: string,
  ) {
    return this.service.list({ staffId, providerId, caseId, includeRevoked: includeRevoked === 'true' });
  }

  /** Grant an assignment to a staff member (or self, when staffId == caller). */
  @Post()
  @ApiOperation({ summary: 'Grant a provider/case access assignment (reason required)' })
  grant(@CurrentStaff() u: any, @Body() dto: { staffId: string; providerId?: string; caseId?: string; reason?: string }) {
    return this.service.grant({ id: u.id, role: u.role, email: u.email }, dto);
  }

  /** Self-assign: grant the current officer access to a provider or case. */
  @Post('self')
  @ApiOperation({ summary: 'Self-assign access (reason required, audited)' })
  selfAssign(@CurrentStaff() u: any, @Body() dto: { providerId?: string; caseId?: string; reason?: string }) {
    return this.service.grant({ id: u.id, role: u.role, email: u.email }, { ...dto, staffId: u.id });
  }

  /** Revoke an assignment (immediate). */
  @Post(':id/revoke')
  revoke(@CurrentStaff() u: any, @Param('id') id: string) {
    return this.service.revoke({ id: u.id, role: u.role }, id);
  }
}
