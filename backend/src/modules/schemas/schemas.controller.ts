import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SchemasService } from './schemas.service';
import { StaffAuthGuard } from '../../common/guards/staff-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentStaff } from '../../common/decorators/current-staff.decorator';

@ApiTags('Schemas')
@ApiBearerAuth()
@UseGuards(StaffAuthGuard, RolesGuard)
@Controller('schemas')
export class SchemasController {
  constructor(private service: SchemasService) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Get(':providerType')
  findOne(@Param('providerType') providerType: string) {
    return this.service.findOne(providerType);
  }

  @Patch(':providerType')
  @Roles('SUPER_ADMIN', 'ADMIN')
  upsert(@Param('providerType') providerType: string, @Body() dto: any, @CurrentStaff() u: any) {
    return this.service.upsert(providerType, dto, u.id);
  }
}
