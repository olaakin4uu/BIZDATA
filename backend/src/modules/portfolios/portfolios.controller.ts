import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PortfoliosService, type PortfolioScope } from './portfolios.service';
import { StaffAuthGuard } from '../../common/guards/staff-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentStaff } from '../../common/decorators/current-staff.decorator';

@ApiTags('Portfolios')
@ApiBearerAuth()
@UseGuards(StaffAuthGuard, RolesGuard)
@Controller('portfolios')
export class PortfoliosController {
  constructor(private service: PortfoliosService) {}

  @Get()
  list(@Query('staffId') staffId?: string) {
    return this.service.list(staffId);
  }

  @Get('workload')
  workload() {
    return this.service.workload();
  }

  @Post()
  @Roles('SUPER_ADMIN', 'ADMIN', 'SUPERVISOR')
  create(
    @Body() body: { staffId: string; scope: PortfolioScope; targetValue: string },
    @CurrentStaff() u: any,
  ) {
    return this.service.create(body.staffId, body.scope, body.targetValue, u.id);
  }

  @Delete(':id')
  @Roles('SUPER_ADMIN', 'ADMIN', 'SUPERVISOR')
  remove(@Param('id') id: string, @CurrentStaff() u: any) {
    return this.service.remove(id, u.id);
  }
}
