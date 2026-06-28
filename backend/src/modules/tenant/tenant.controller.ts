import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { TenantService } from './tenant.service';
import { StaffAuthGuard } from '../../common/guards/staff-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('Tenant')
@ApiBearerAuth()
@UseGuards(StaffAuthGuard, RolesGuard)
@Controller('tenant')
export class TenantController {
  constructor(private service: TenantService) {}

  @Get()
  get() {
    return this.service.get();
  }

  @Patch()
  @Roles('SUPER_ADMIN', 'ADMIN')
  update(@Body() dto: any) {
    return this.service.update(dto);
  }
}
