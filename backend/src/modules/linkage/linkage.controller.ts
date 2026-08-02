import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { LinkageService } from './linkage.service';
import { StaffAuthGuard } from '../../common/guards/staff-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';

@ApiTags('Account linkage')
@ApiBearerAuth()
@UseGuards(StaffAuthGuard, RolesGuard)
@Controller('linkage')
export class LinkageController {
  constructor(private service: LinkageService) {}

  @Get('by-identifier')
  @ApiOperation({ summary: 'Customers holding several accounts, grouped by the NIN/BVN reported' })
  byIdentifier(@Query() q: any) {
    return this.service.byIdentifier(q);
  }

  @Get('by-name')
  @ApiOperation({ summary: 'Account-name clusters spanning several accounts or providers (leads for review)' })
  byName(@Query() q: any) {
    return this.service.byName(q);
  }
}
