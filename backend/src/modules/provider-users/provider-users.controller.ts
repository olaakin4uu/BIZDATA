import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ProviderUsersService } from './provider-users.service';
import { StaffAuthGuard } from '../../common/guards/staff-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentStaff } from '../../common/decorators/current-staff.decorator';

@ApiTags('Provider Users')
@ApiBearerAuth()
@UseGuards(StaffAuthGuard, RolesGuard)
@Controller()
export class ProviderUsersController {
  constructor(private service: ProviderUsersService) {}

  @Post('providers/:providerId/users')
  @Roles('SUPER_ADMIN', 'ADMIN')
  create(@Param('providerId') providerId: string, @Body() dto: any, @CurrentStaff() u: any) {
    return this.service.create(providerId, dto, u.id);
  }

  @Get('providers/:providerId/users')
  listByProvider(@Param('providerId') providerId: string) {
    return this.service.listByProvider(providerId);
  }

  @Get('provider-users/:id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch('provider-users/:id')
  @Roles('SUPER_ADMIN', 'ADMIN')
  update(@Param('id') id: string, @Body() dto: any, @CurrentStaff() u: any) {
    return this.service.update(id, dto, u.id);
  }

  @Post('provider-users/:id/reset-password')
  @Roles('SUPER_ADMIN', 'ADMIN')
  resetPassword(@Param('id') id: string, @Body() body: { newPassword: string }, @CurrentStaff() u: any) {
    return this.service.resetPassword(id, body.newPassword, u.id);
  }
}
