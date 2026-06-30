import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { StaffAuthGuard } from '../../common/guards/staff-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentStaff } from '../../common/decorators/current-staff.decorator';

@ApiTags('Notifications')
@ApiBearerAuth()
@UseGuards(StaffAuthGuard, RolesGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private service: NotificationsService) {}

  @Get()
  list(@CurrentStaff() u: any) {
    return this.service.list(u?.role);
  }

  @Patch(':id/read')
  markRead(@Param('id') id: string) {
    return this.service.markRead(id);
  }

  @Post('generate')
  @Roles('SUPER_ADMIN', 'ADMIN', 'SUPERVISOR')
  generate(@Body() dto: any) {
    return this.service.generate(parseInt(dto?.year ?? new Date().getFullYear(), 10));
  }
}
