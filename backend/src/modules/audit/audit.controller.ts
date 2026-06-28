import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuditQueryService } from './audit.service';
import { StaffAuthGuard } from '../../common/guards/staff-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('Audit')
@ApiBearerAuth()
@UseGuards(StaffAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN', 'ADMIN', 'AUDIT_OFFICER', 'DPO')
@Controller('audit')
export class AuditController {
  constructor(private service: AuditQueryService) {}

  @Get()
  findAll(@Query() q: any) {
    return this.service.findAll(q);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }
}
