import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AccessService } from './access.service';
import { StaffAuthGuard } from '../../common/guards/staff-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentStaff } from '../../common/decorators/current-staff.decorator';

@ApiTags('Access')
@ApiBearerAuth()
@UseGuards(StaffAuthGuard, RolesGuard)
@Controller('access/elevations')
export class AccessController {
  constructor(private service: AccessService) {}

  @Post()
  request(@Body() dto: any, @CurrentStaff() u: any) {
    return this.service.request(u.id, dto?.reason);
  }

  @Get('me')
  mine(@CurrentStaff() u: any) {
    return this.service.mine(u.id);
  }

  @Get('pending')
  @Roles('SUPER_ADMIN', 'ADMIN', 'SUPERVISOR')
  pending(@CurrentStaff() u: any) {
    return this.service.pending(u?.id);
  }

  @Post(':id/approve')
  @Roles('SUPER_ADMIN', 'ADMIN', 'SUPERVISOR')
  approve(@Param('id') id: string, @CurrentStaff() u: any) {
    return this.service.approve(id, { id: u.id, role: u.role });
  }

  @Post(':id/deny')
  @Roles('SUPER_ADMIN', 'ADMIN', 'SUPERVISOR')
  deny(@Param('id') id: string, @CurrentStaff() u: any) {
    return this.service.deny(id, { id: u.id, role: u.role });
  }

  @Post(':id/revoke')
  revoke(@Param('id') id: string, @CurrentStaff() u: any) {
    return this.service.revoke(id, u.id);
  }
}
