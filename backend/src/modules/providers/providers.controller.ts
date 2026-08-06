import {
  BadRequestException, Body, Controller, Get, Header, Headers, Param, Patch, Post, Query, Res, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ProvidersService } from './providers.service';
import { ProviderComplianceService } from './provider-compliance.service';
import { AuthService } from '../auth/auth.service';
import { AccessAssignmentService } from '../access/access-assignment.service';
import { AccessGrantTokenService } from '../access/access-grant-token.service';
import { StaffAuthGuard } from '../../common/guards/staff-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentStaff } from '../../common/decorators/current-staff.decorator';

@ApiTags('Providers')
@ApiBearerAuth()
@UseGuards(StaffAuthGuard, RolesGuard)
@Controller('providers')
export class ProvidersController {
  constructor(
    private service: ProvidersService,
    private compliance: ProviderComplianceService,
    private auth: AuthService,
    private access: AccessAssignmentService,
    private grant: AccessGrantTokenService,
  ) {}

  @Post()
  @Roles('SUPER_ADMIN', 'ADMIN')
  create(@Body() dto: any, @CurrentStaff() u: any) {
    return this.service.create(dto, u.id);
  }

  @Post(':id/grant-resubmit')
  @Roles('SUPER_ADMIN', 'ADMIN')
  grantResubmit(@Param('id') id: string, @Body() dto: { periodLabel: string; reason?: string }, @CurrentStaff() u: any) {
    return this.service.grantResubmit(id, dto?.periodLabel, dto?.reason, u.id);
  }

  @Get('stats')
  stats() {
    return this.service.stats();
  }

  // §29 / §6.6 obligation tracking. Declared before ':id' so the literal wins.
  @Get('compliance/summary')
  complianceSummary(@Query('year') year?: string) {
    return this.compliance.summary(parseInt(year ?? `${new Date().getFullYear()}`, 10));
  }

  @Get('compliance')
  complianceList(@Query('year') year?: string, @Query('providerId') providerId?: string) {
    return this.compliance.forYear(parseInt(year ?? `${new Date().getFullYear()}`, 10), providerId);
  }

  // ─── Provider late/failure-to-file penalties (NTAA s.101) ───────────────────
  @Get('penalties')
  listPenalties(@Query('year') year?: string, @Query('providerId') providerId?: string, @Query('status') status?: string) {
    return this.compliance.listPenalties({
      providerId, status,
      year: year ? parseInt(year, 10) : undefined,
    });
  }

  @Post('penalties/issue')
  @Roles('SUPER_ADMIN', 'ADMIN')
  issuePenalty(@Body() dto: { providerId: string; periodLabel: string }, @CurrentStaff() u: any) {
    if (!dto?.providerId || !dto?.periodLabel) throw new BadRequestException('providerId and periodLabel are required.');
    return this.compliance.issuePenalty(dto.providerId, dto.periodLabel, u.id);
  }

  @Post('penalties/issue-all')
  @Roles('SUPER_ADMIN', 'ADMIN')
  issueAllPenalties(@Body() dto: { year?: number }, @CurrentStaff() u: any) {
    return this.compliance.issueAllForYear(dto?.year ?? new Date().getFullYear(), u.id);
  }

  /** Formal printable penalty notice (HTML → print/PDF). Marks the penalty NOTIFIED. */
  @Get('penalties/:id/notice')
  @Roles('SUPER_ADMIN', 'ADMIN')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Cache-Control', 'no-store, no-cache, must-revalidate, private')
  @Header('Pragma', 'no-cache')
  penaltyNotice(@Param('id') id: string, @CurrentStaff() u: any) {
    return this.compliance.penaltyNotice(id, { id: u.id, email: u.email });
  }

  @Get()
  findAll(@Query() q: any) {
    return this.service.findAll(q);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  @Roles('SUPER_ADMIN', 'ADMIN')
  update(@Param('id') id: string, @Body() dto: any, @CurrentStaff() u: any) {
    return this.service.update(id, dto, u.id);
  }

  @Patch(':id/status')
  @Roles('SUPER_ADMIN', 'ADMIN')
  updateStatus(@Param('id') id: string, @Body() body: { status: string }, @CurrentStaff() u: any) {
    return this.service.updateStatus(id, body.status, u.id);
  }

  /** A provider's upload envelopes (metadata only — no PII, no step-up needed). */
  @Get(':id/uploads')
  listUploads(@Param('id') id: string) {
    return this.service.listUploads(id);
  }

  /**
   * The sensitive records inside one upload. Gated by step-up re-auth: the caller
   * must pass a valid step-up token (from POST /auth/staff/step-up) in the
   * `x-step-up` header, scoped to PROVIDER_UPLOADS.
   */
  @Get('uploads/:submissionId/records')
  @Roles('SUPER_ADMIN', 'ADMIN')
  async uploadRecords(
    @CurrentStaff() u: any,
    @Param('submissionId') submissionId: string,
    @Headers('x-step-up') stepUpToken: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    if (!stepUpToken) {
      throw new BadRequestException('Step-up authorisation required to view upload records.');
    }
    const { staffId } = await this.auth.verifyStepUp(stepUpToken, 'PROVIDER_UPLOADS');
    // Need-to-know: the officer must be assigned to this upload's provider.
    // Re-checked on every fetch, so a revoke cuts access immediately.
    const providerId = await this.service.providerIdForSubmission(submissionId);
    await this.access.assertProviderAccess({ id: staffId, role: u.role }, providerId);
    // Four-eyes: also require a live, SUPER_ADMIN-approved grant token session.
    await this.grant.assertActiveSession(staffId, { providerId });
    return this.service.getUploadRecords(submissionId, staffId, {
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  /** Step-up gated CSV export of an upload's records. */
  @Get('uploads/:submissionId/export')
  @Roles('SUPER_ADMIN', 'ADMIN')
  async exportUpload(
    @CurrentStaff() u: any,
    @Param('submissionId') submissionId: string,
    @Headers('x-step-up') stepUpToken: string,
    @Res() res: any,
  ) {
    if (!stepUpToken) {
      throw new BadRequestException('Step-up authorisation required to export upload records.');
    }
    const { staffId } = await this.auth.verifyStepUp(stepUpToken, 'PROVIDER_UPLOADS');
    const providerId = await this.service.providerIdForSubmission(submissionId);
    await this.access.assertProviderAccess({ id: staffId, role: u.role }, providerId);
    await this.grant.assertActiveSession(staffId, { providerId });
    const { filename, csv } = await this.service.exportUploadCsv(submissionId, staffId, {
      email: u.email, firstName: u.firstName, lastName: u.lastName,
    });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  }
}
