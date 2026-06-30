import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { GovernanceService } from './governance.service';
import { StaffAuthGuard } from '../../common/guards/staff-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('Governance')
@ApiBearerAuth()
@UseGuards(StaffAuthGuard, RolesGuard)
@Controller('governance')
export class GovernanceController {
  constructor(private service: GovernanceService) {}

  @Get('report')
  report(@Query('year') year?: string) {
    return this.service.report(parseInt(year ?? `${new Date().getFullYear()}`, 10));
  }

  @Get('mou')
  listMou() {
    return this.service.listMou();
  }

  @Post('mou')
  @Roles('SUPER_ADMIN', 'ADMIN')
  upsertMou(@Body() dto: any) {
    return this.service.upsertMou(dto);
  }
}
