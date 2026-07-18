import { Body, Controller, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PayeService } from './paye.service';
import { StaffAuthGuard } from '../../common/guards/staff-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentStaff } from '../../common/decorators/current-staff.decorator';
import { ApiKeyGuard } from '../integration/api-key.guard';

// Staff-facing manual PAYE override. The bulk Tax-app push lives on
// POST /integration/paye (API-key auth) — see IntegrationPayeController.
@ApiTags('PAYE')
@ApiBearerAuth()
@UseGuards(StaffAuthGuard, RolesGuard)
@Controller('paye')
export class PayeController {
  constructor(private paye: PayeService) {}

  @Post('taxpayer/:id')
  @Roles('SUPER_ADMIN', 'ADMIN', 'SUPERVISOR', 'ANALYST')
  @ApiOperation({ summary: 'Manually set a taxpayer PAYE status (REGISTERED | NOT_REGISTERED | UNKNOWN)' })
  setManual(@Param('id') id: string, @Body() dto: any, @CurrentStaff() u: any) {
    return this.paye.setManual(id, dto, u.id);
  }

  @Post('register/:id')
  @Roles('SUPER_ADMIN', 'ADMIN', 'SUPERVISOR', 'ANALYST')
  @ApiOperation({ summary: 'Register ONE corporate employer for PAYE (real Tax-app reg when configured, else provisional)' })
  register(@Param('id') id: string, @CurrentStaff() u: any) {
    return this.paye.registerForPaye(id, u.id);
  }

  @Post('auto-register')
  @Roles('SUPER_ADMIN', 'ADMIN', 'SUPERVISOR')
  @ApiOperation({ summary: 'Bulk-register the PAYE-gap corporates (optionally scoped by ids / minInflow / limit)' })
  autoRegister(@Body() body: { ids?: string[]; minInflow?: number; limit?: number }, @CurrentStaff() u: any) {
    return this.paye.autoRegisterPaye(u.id, { ids: body?.ids, minInflow: body?.minInflow, limit: body?.limit });
  }
}

// Partner endpoint: the KIRS Tax app pushes PAYE-registration status into
// BIZDATA in bulk (matched by RC number / TIN). API-key authenticated, mirrors
// POST /integration/declared-income.
@ApiTags('Integration (partner)')
@ApiHeader({ name: 'x-api-key', description: 'Partner platform API key' })
@UseGuards(ApiKeyGuard)
@Controller('integration/paye')
export class IntegrationPayeController {
  constructor(private paye: PayeService) {}

  @Post()
  @ApiOperation({ summary: 'Push PAYE-registration records (JSON array). ?dryRun=true validates without writing.' })
  async importJson(@Body() body: any, @Query('dryRun') dryRun: string | undefined, @Req() req: any) {
    return this.paye.processJson(body, {
      dryRun: dryRun === 'true' || dryRun === '1',
      partnerName: req.partner?.name,
    });
  }
}
