import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SchedulerService } from './scheduler.service';
import { StaffAuthGuard } from '../../common/guards/staff-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentStaff } from '../../common/decorators/current-staff.decorator';

@ApiTags('Scheduler')
@ApiBearerAuth()
@UseGuards(StaffAuthGuard, RolesGuard)
@Controller('scheduler')
export class SchedulerController {
  constructor(private service: SchedulerService) {}

  @Post('run-now')
  @Roles('SUPER_ADMIN', 'ADMIN')
  runNow(@Body() dto: any, @CurrentStaff() u: any) {
    return this.service.runNow(parseInt(dto?.year ?? new Date().getFullYear(), 10), u.id);
  }
}
