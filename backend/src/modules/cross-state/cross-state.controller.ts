import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CrossStateService } from './cross-state.service';
import { StaffAuthGuard } from '../../common/guards/staff-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentStaff } from '../../common/decorators/current-staff.decorator';

@ApiTags('CrossState')
@ApiBearerAuth()
@UseGuards(StaffAuthGuard, RolesGuard)
@Controller('cross-state')
export class CrossStateController {
  constructor(private service: CrossStateService) {}

  @Get('candidates')
  candidates(@Query('year') year?: string) {
    return this.service.candidates(parseInt(year ?? `${new Date().getFullYear()}`, 10));
  }

  @Get()
  list(@Query() q: any) {
    return this.service.list(q);
  }

  @Post('generate')
  @Roles('SUPER_ADMIN', 'ADMIN', 'SUPERVISOR')
  generate(@Body() dto: any, @CurrentStaff() u: any) {
    return this.service.generate(parseInt(dto?.year ?? new Date().getFullYear(), 10), u.id);
  }

  @Post(':id/send')
  @Roles('SUPER_ADMIN', 'ADMIN', 'SUPERVISOR')
  send(@Param('id') id: string, @CurrentStaff() u: any) {
    return this.service.send(id, u.id);
  }

  @Post('inbound')
  @Roles('SUPER_ADMIN', 'ADMIN', 'SUPERVISOR')
  inbound(@Body() dto: any, @CurrentStaff() u: any) {
    return this.service.inbound(dto, u.id);
  }
}
