import { Body, Controller, Get, Header, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CasesService } from './cases.service';
import { StaffAuthGuard } from '../../common/guards/staff-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentStaff } from '../../common/decorators/current-staff.decorator';

@ApiTags('Cases')
@ApiBearerAuth()
@UseGuards(StaffAuthGuard, RolesGuard)
@Controller('cases')
export class CasesController {
  constructor(private service: CasesService) {}

  @Get('stats')
  stats(@Query() q: any) {
    return this.service.stats(q);
  }

  @Post('process-deadlines')
  @Roles('SUPER_ADMIN', 'ADMIN', 'SUPERVISOR')
  processDeadlines(@CurrentStaff() u: any) {
    return this.service.processDeadlines(u.id);
  }

  @Get()
  findAll(@Query() q: any) {
    return this.service.findAll(q);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Get(':id/evidence')
  @Header('Content-Type', 'text/html; charset=utf-8')
  evidence(@Param('id') id: string, @CurrentStaff() u: any) {
    return this.service.evidenceBundle(id, { id: u.id, email: u.email });
  }

  @Patch(':id/status')
  @Roles('SUPER_ADMIN', 'ADMIN', 'SUPERVISOR', 'ANALYST')
  transition(@Param('id') id: string, @Body() dto: any, @CurrentStaff() u: any) {
    return this.service.transition(id, dto, u.id);
  }

  @Patch(':id/assign')
  @Roles('SUPER_ADMIN', 'ADMIN', 'SUPERVISOR')
  assign(@Param('id') id: string, @Body() dto: any, @CurrentStaff() u: any) {
    return this.service.assign(id, dto.assignedToId ?? null, u.id);
  }
}
