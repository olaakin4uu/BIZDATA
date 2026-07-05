import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { IdentityService } from './identity.service';
import { StaffAuthGuard } from '../../common/guards/staff-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentStaff } from '../../common/decorators/current-staff.decorator';

@ApiTags('Identity')
@ApiBearerAuth()
@UseGuards(StaffAuthGuard, RolesGuard)
@Controller('identity')
export class IdentityController {
  constructor(private service: IdentityService) {}

  @Get('status')
  @ApiOperation({ summary: 'Resolution status — how many BVNs can be bridged to a NIN' })
  status() {
    return this.service.resolveStatus();
  }

  @Post('resolve/:id')
  @Roles('SUPER_ADMIN', 'ADMIN', 'SUPERVISOR', 'ANALYST')
  @ApiOperation({ summary: 'Resolve one taxpayer BVN → NIN and enrich the record' })
  resolveOne(@Param('id') id: string, @CurrentStaff() u: any) {
    return this.service.resolveOne(id, u.id);
  }

  @Post('resolve-bulk')
  @Roles('SUPER_ADMIN', 'ADMIN', 'SUPERVISOR')
  @ApiOperation({ summary: 'Bulk resolve BVN → NIN across taxpayers with no NIN' })
  resolveBulk(@Body() body: { ids?: string[]; limit?: number }, @CurrentStaff() u: any) {
    return this.service.resolveBulk(u.id, { ids: body?.ids, limit: body?.limit });
  }
}
