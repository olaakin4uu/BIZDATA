import {
  BadRequestException,
  Body, Controller, Delete, Get, Headers, Param, Post, Query, Req, UseGuards,
  UseInterceptors, UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags, ApiOperation, ApiConsumes, ApiHeader } from '@nestjs/swagger';
import { IntegrationService } from './integration.service';
import { ApiKeyGuard } from './api-key.guard';
import { DeclaredIncomeService } from '../declared-income/declared-income.service';
import { StaffAuthGuard } from '../../common/guards/staff-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentStaff } from '../../common/decorators/current-staff.decorator';

// ─── STAFF: partner API-key management ────────────────────────────────────────
@ApiTags('Integration (admin)')
@ApiBearerAuth()
@UseGuards(StaffAuthGuard, RolesGuard)
@Controller('integration/keys')
export class IntegrationKeysController {
  constructor(private service: IntegrationService) {}

  @Get()
  list() {
    return this.service.listApiKeys();
  }

  @Post()
  @Roles('SUPER_ADMIN', 'ADMIN')
  @ApiOperation({ summary: 'Mint a partner API key (raw key returned once)' })
  create(@Body() body: { name: string }, @CurrentStaff() u: any) {
    return this.service.createApiKey(body?.name, u.id);
  }

  @Delete(':id')
  @Roles('SUPER_ADMIN', 'ADMIN')
  revoke(@Param('id') id: string, @CurrentStaff() u: any) {
    return this.service.revokeApiKey(id, u.id);
  }
}

// ─── PARTNER: taxpayer-facing integration API (API-key authenticated) ─────────
@ApiTags('Integration (partner)')
@ApiHeader({ name: 'x-api-key', description: 'Partner platform API key' })
@ApiHeader({ name: 'x-case-token', description: 'Per-case access token from the demand notice' })
@UseGuards(ApiKeyGuard)
@Controller('integration/taxpayer')
export class IntegrationTaxpayerController {
  constructor(private service: IntegrationService) {}

  @Get('notice')
  @ApiOperation({ summary: 'Fetch the demand notice for the case scoped by x-case-token' })
  notice(@Headers('x-case-token') token: string, @Req() req: any) {
    return this.service.getNotice(token, req.partner?.name);
  }

  @Post('objection')
  @ApiOperation({ summary: 'File an objection against the demand notice' })
  objection(@Headers('x-case-token') token: string, @Body() body: { grounds: string }, @Req() req: any) {
    return this.service.fileObjection(token, body?.grounds, req.partner?.name);
  }

  @Post('document')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload a supporting document (fed to Document Intelligence)' })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 25 * 1024 * 1024 } }))
  document(
    @Headers('x-case-token') token: string,
    @UploadedFile() file: any,
    @Body() body: { pastedText?: string },
    @Req() req: any,
  ) {
    return this.service.uploadDocument(token, file, body?.pastedText, req.partner?.name);
  }

  @Get('outcome')
  @ApiOperation({ summary: 'Check the current outcome/status of the case' })
  outcome(@Headers('x-case-token') token: string, @Req() req: any) {
    return this.service.getOutcome(token, req.partner?.name);
  }
}

// ─── PARTNER: inbound declared-income import (API-key only, not case-scoped) ───
// A partner tax platform pushes taxpayers' declared income INTO BIZDATA so it
// can be compared against ingested provider data. Keyed by NIN/RC — no case
// token, since this spans many taxpayers rather than one open case.
@ApiTags('Integration (partner)')
@ApiHeader({ name: 'x-api-key', description: 'Partner platform API key' })
@UseGuards(ApiKeyGuard)
@Controller('integration/declared-income')
export class IntegrationDeclaredIncomeController {
  constructor(private declaredIncome: DeclaredIncomeService) {}

  @Post()
  @ApiOperation({ summary: 'Push declared-income records (JSON array). ?dryRun=true validates without writing.' })
  async importJson(
    @Body() body: any,
    @Query('dryRun') dryRun: string | undefined,
    @Req() req: any,
  ) {
    return this.declaredIncome.processJson(body, {
      dryRun: dryRun === 'true' || dryRun === '1',
      source: 'PARTNER_API',
      partnerName: req.partner?.name,
    });
  }

  @Post('csv')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Push declared income as a CSV file. ?dryRun=true validates without writing.' })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 100 * 1024 * 1024 } }))
  async importCsv(
    @UploadedFile() file: any,
    @Query('dryRun') dryRun: string | undefined,
    @Req() req: any,
  ) {
    if (!file) throw new BadRequestException('file is required');
    return this.declaredIncome.processCsv(file.buffer.toString('utf8'), {
      dryRun: dryRun === 'true' || dryRun === '1',
      source: 'PARTNER_API',
    });
  }
}
