import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ScanService } from './scan.service';
import { StaffAuthGuard } from '../../common/guards/staff-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentStaff } from '../../common/decorators/current-staff.decorator';

@ApiTags('Scan')
@ApiBearerAuth()
@UseGuards(StaffAuthGuard, RolesGuard)
@Controller('scan')
export class ScanController {
  constructor(private service: ScanService) {}

  @Post()
  @Roles('SUPER_ADMIN', 'ADMIN', 'SUPERVISOR', 'ANALYST')
  create(@Body() dto: any, @CurrentStaff() u: any) {
    return this.service.create(dto, u.id);
  }

  @Get()
  findAll(@Query() q: any) {
    return this.service.findAll(q);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }
}
