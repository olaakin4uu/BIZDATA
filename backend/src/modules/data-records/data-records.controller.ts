import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { DataRecordsService } from './data-records.service';
import { StaffAuthGuard } from '../../common/guards/staff-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentStaff } from '../../common/decorators/current-staff.decorator';

@ApiTags('Data Records')
@ApiBearerAuth()
@UseGuards(StaffAuthGuard, RolesGuard)
@Controller('data-records')
export class DataRecordsController {
  constructor(private service: DataRecordsService) {}

  @Get('stats')
  stats() {
    return this.service.stats();
  }

  @Get()
  findAll(@Query() q: any) {
    return this.service.findAll(q);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id/review')
  @Roles('SUPER_ADMIN', 'ADMIN', 'AUDIT_OFFICER', 'SUPERVISOR', 'ANALYST')
  review(@Param('id') id: string, @Body() dto: any, @CurrentStaff() u: any) {
    return this.service.review(id, dto, u.id);
  }
}
