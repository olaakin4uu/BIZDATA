import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { MetricsService } from './metrics.service';
import { StaffAuthGuard } from '../../common/guards/staff-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('Metrics')
@ApiBearerAuth()
@UseGuards(StaffAuthGuard, RolesGuard)
// Detection-engine performance metrics are analytical data — restrict to the
// same roles that can run scans / view agent signals. RolesGuard is a no-op
// without an explicit @Roles list, so it must be declared (not just applied).
@Roles('SUPER_ADMIN', 'ADMIN', 'SUPERVISOR', 'ANALYST')
@Controller('metrics')
export class MetricsController {
  constructor(private service: MetricsService) {}

  @Get('model')
  model(@Query('year') year?: string) {
    return this.service.model(parseInt(year ?? `${new Date().getFullYear()}`, 10));
  }
}
