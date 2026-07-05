import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AnalyticsService } from './analytics.service';
import { StaffAuthGuard } from '../../common/guards/staff-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';

@ApiTags('Analytics')
@ApiBearerAuth()
@UseGuards(StaffAuthGuard, RolesGuard)
@Controller('analytics')
export class AnalyticsController {
  constructor(private service: AnalyticsService) {}

  @Get('by-provider')
  byProvider(@Query('year') year?: string) {
    return this.service.byProvider(year ? parseInt(year, 10) : undefined);
  }

  @Get('by-sector')
  bySector(@Query('year') year?: string) {
    return this.service.bySector(year ? parseInt(year, 10) : undefined);
  }
}
