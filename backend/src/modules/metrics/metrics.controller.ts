import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { MetricsService } from './metrics.service';
import { StaffAuthGuard } from '../../common/guards/staff-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';

@ApiTags('Metrics')
@ApiBearerAuth()
@UseGuards(StaffAuthGuard, RolesGuard)
@Controller('metrics')
export class MetricsController {
  constructor(private service: MetricsService) {}

  @Get('model')
  model(@Query('year') year?: string) {
    return this.service.model(parseInt(year ?? `${new Date().getFullYear()}`, 10));
  }
}
