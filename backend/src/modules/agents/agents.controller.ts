import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AgentsService } from './agents.service';
import { StaffAuthGuard } from '../../common/guards/staff-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentStaff } from '../../common/decorators/current-staff.decorator';

@ApiTags('Agents')
@ApiBearerAuth()
@UseGuards(StaffAuthGuard, RolesGuard)
@Controller('agents')
export class AgentsController {
  constructor(private service: AgentsService) {}

  @Post('run')
  @Roles('SUPER_ADMIN', 'ADMIN', 'SUPERVISOR', 'ANALYST')
  run(@Body() dto: any, @CurrentStaff() u: any) {
    return this.service.run(parseInt(dto?.year ?? new Date().getFullYear(), 10), u.id);
  }

  @Get('signals')
  signals(@Query() q: any) {
    return this.service.signals(q);
  }

  @Get('signals/summary')
  signalSummary(@Query('year') year?: string) {
    return this.service.signalSummary(year ? parseInt(year, 10) : undefined);
  }
}
