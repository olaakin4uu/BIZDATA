import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { StaffAuthGuard } from '../../common/guards/staff-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentStaff } from '../../common/decorators/current-staff.decorator';

@ApiTags('Users')
@ApiBearerAuth()
@UseGuards(StaffAuthGuard, RolesGuard)
@Controller('users')
export class UsersController {
  constructor(private service: UsersService) {}

  @Post()
  @Roles('SUPER_ADMIN', 'ADMIN')
  create(@Body() dto: any, @CurrentStaff() u: any) {
    return this.service.create(dto, u.id);
  }

  @Get()
  @Roles('SUPER_ADMIN', 'ADMIN', 'SUPERVISOR')
  findAll(@Query() q: any) {
    return this.service.findAll(q);
  }

  @Get(':id')
  @Roles('SUPER_ADMIN', 'ADMIN', 'SUPERVISOR')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  @Roles('SUPER_ADMIN', 'ADMIN')
  update(@Param('id') id: string, @Body() dto: any, @CurrentStaff() u: any) {
    return this.service.update(id, dto, u.id);
  }

  @Post(':id/reset-password')
  @Roles('SUPER_ADMIN', 'ADMIN')
  resetPassword(@Param('id') id: string, @Body() body: { newPassword: string }, @CurrentStaff() u: any) {
    return this.service.resetPassword(id, body.newPassword, u.id);
  }
}
