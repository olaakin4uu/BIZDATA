import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Taxpayer360Service } from './taxpayer360.service';
import { StaffAuthGuard } from '../../common/guards/staff-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';

@ApiTags('Taxpayer360')
@ApiBearerAuth()
@UseGuards(StaffAuthGuard, RolesGuard)
@Controller('taxpayer360')
export class Taxpayer360Controller {
  constructor(private service: Taxpayer360Service) {}

  // 'search' declared before ':id' so the literal route wins.
  @Get('search')
  search(@Query('q') q: string) {
    return this.service.search(q ?? '');
  }

  @Get(':id')
  profile(@Param('id') id: string) {
    return this.service.profile(id);
  }
}
