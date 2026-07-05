import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { StatutoryService, type StatutoryValues } from './statutory.service';
import { StaffAuthGuard } from '../../common/guards/staff-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentStaff } from '../../common/decorators/current-staff.decorator';

@ApiTags('Statutory')
@ApiBearerAuth()
@UseGuards(StaffAuthGuard, RolesGuard)
@Controller('statutory')
export class StatutoryController {
  constructor(private service: StatutoryService) {}

  @Get()
  @ApiOperation({ summary: 'Active statutory configuration' })
  active() {
    return this.service.active();
  }

  @Get('history')
  history() {
    return this.service.history();
  }

  @Patch()
  @Roles('SUPER_ADMIN', 'ADMIN')
  @ApiOperation({ summary: 'Update statutory config — creates a new active version' })
  update(@Body() body: Partial<StatutoryValues> & { note?: string }, @CurrentStaff() u: any) {
    const { note, ...patch } = body ?? {};
    return this.service.update(patch, note, u.id);
  }
}
