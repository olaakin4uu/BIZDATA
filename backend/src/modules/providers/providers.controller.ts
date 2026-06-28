import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ProvidersService } from './providers.service';
import { StaffAuthGuard } from '../../common/guards/staff-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentStaff } from '../../common/decorators/current-staff.decorator';

@ApiTags('Providers')
@ApiBearerAuth()
@UseGuards(StaffAuthGuard, RolesGuard)
@Controller('providers')
export class ProvidersController {
  constructor(private service: ProvidersService) {}

  @Post()
  @Roles('SUPER_ADMIN', 'ADMIN')
  create(@Body() dto: any, @CurrentStaff() u: any) {
    return this.service.create(dto, u.id);
  }

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

  @Patch(':id')
  @Roles('SUPER_ADMIN', 'ADMIN')
  update(@Param('id') id: string, @Body() dto: any, @CurrentStaff() u: any) {
    return this.service.update(id, dto, u.id);
  }

  @Patch(':id/status')
  @Roles('SUPER_ADMIN', 'ADMIN')
  updateStatus(@Param('id') id: string, @Body() body: { status: string }, @CurrentStaff() u: any) {
    return this.service.updateStatus(id, body.status, u.id);
  }
}
