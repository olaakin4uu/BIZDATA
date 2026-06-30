import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { NdpaService } from './ndpa.service';
import { StaffAuthGuard } from '../../common/guards/staff-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentStaff } from '../../common/decorators/current-staff.decorator';

@ApiTags('NDPA')
@ApiBearerAuth()
@UseGuards(StaffAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN', 'ADMIN', 'DPO')
@Controller('ndpa')
export class NdpaController {
  constructor(private service: NdpaService) {}

  @Get('dpo-report')
  dpoReport() {
    return this.service.dpoReport();
  }

  @Get('retention')
  retention(@Query('years') years?: string) {
    return this.service.retentionPreview(years ? parseInt(years, 10) : undefined);
  }

  @Post('retention/purge')
  @Roles('SUPER_ADMIN', 'ADMIN', 'DPO')
  purge(@Body() dto: any, @CurrentStaff() u: any) {
    return this.service.purge(u.id, dto?.years ? parseInt(dto.years, 10) : undefined);
  }
}
