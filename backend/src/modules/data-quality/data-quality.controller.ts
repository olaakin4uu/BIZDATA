import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { DataQualityService } from './data-quality.service';
import { StaffAuthGuard } from '../../common/guards/staff-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';

@ApiTags('Data quality')
@ApiBearerAuth()
@UseGuards(StaffAuthGuard, RolesGuard)
@Controller('data-quality')
export class DataQualityController {
  constructor(private service: DataQualityService) {}

  @Get('identifiers')
  @ApiOperation({ summary: 'Identifier coverage of submitted returns — NIN/BVN/account per provider, and TIN/RC on the register' })
  identifiers(@Query() q: any) {
    return this.service.identifiers(q);
  }
}
