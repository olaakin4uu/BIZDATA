import {
  Body, Controller, Get, Header, Param, Patch, Post, Query, Res, UseGuards,
  UseInterceptors, UploadedFile,
} from '@nestjs/common';
import type { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { CasesService } from './cases.service';
import { AccessAssignmentService } from '../access/access-assignment.service';
import { AccessGrantTokenService } from '../access/access-grant-token.service';
import { ExportService } from '../iris/export/export.service';
import { StaffAuthGuard } from '../../common/guards/staff-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentStaff } from '../../common/decorators/current-staff.decorator';

@ApiTags('Cases')
@ApiBearerAuth()
@UseGuards(StaffAuthGuard, RolesGuard)
@Controller('cases')
export class CasesController {
  constructor(
    private service: CasesService,
    private access: AccessAssignmentService,
    private grant: AccessGrantTokenService,
    private exportSvc: ExportService,
  ) {}

  @Get('stats')
  stats(@Query() q: any) {
    return this.service.stats(q);
  }

  @Post('process-deadlines')
  @Roles('SUPER_ADMIN', 'ADMIN', 'SUPERVISOR')
  processDeadlines(@CurrentStaff() u: any) {
    return this.service.processDeadlines(u.id);
  }

  @Get()
  findAll(@Query() q: any) {
    return this.service.findAll(q);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Get(':id/evidence')
  @Roles('SUPER_ADMIN', 'ADMIN')
  @Header('Content-Type', 'text/html; charset=utf-8')
  // Confidential document with decrypted PII — never let the browser or any proxy
  // cache it to disk.
  @Header('Cache-Control', 'no-store, no-cache, must-revalidate, private')
  @Header('Pragma', 'no-cache')
  async evidence(@Param('id') id: string, @CurrentStaff() u: any) {
    // Need-to-know: the evidence bundle fully decrypts the taxpayer's PII, so the
    // officer must hold an active case-level assignment. Re-checked here, so a
    // revoke blocks the next export immediately.
    await this.access.assertCaseAccess({ id: u.id, role: u.role }, id);
    // Four-eyes: also require a live, SUPER_ADMIN-approved grant token session.
    await this.grant.assertActiveSession(u.id, { caseId: id });
    return this.service.evidenceBundle(id, { id: u.id, email: u.email, firstName: u.firstName, lastName: u.lastName });
  }

  @Get(':id/evidence.xlsx')
  @Roles('SUPER_ADMIN', 'ADMIN')
  @Header('Cache-Control', 'no-store, no-cache, must-revalidate, private')
  @Header('Pragma', 'no-cache')
  async evidenceXlsx(@Param('id') id: string, @CurrentStaff() u: any, @Res() res: Response) {
    await this.access.assertCaseAccess({ id: u.id, role: u.role }, id);
    await this.grant.assertActiveSession(u.id, { caseId: id });
    const spec = await this.service.evidenceExportRows(id);
    const { fileName, mimeType, buffer } = await this.exportSvc.renderDirect(
      { id: u.id, email: u.email, firstName: u.firstName, lastName: u.lastName },
      { format: 'xlsx', fileName: `evidence-bundle-${id.slice(0, 8)}`, title: spec.title, columns: spec.columns, rows: spec.rows },
    );
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(buffer);
  }

  @Patch(':id/status')
  @Roles('SUPER_ADMIN', 'ADMIN', 'SUPERVISOR', 'ANALYST')
  transition(@Param('id') id: string, @Body() dto: any, @CurrentStaff() u: any) {
    return this.service.transition(id, dto, u.id);
  }

  @Patch(':id/assign')
  @Roles('SUPER_ADMIN', 'ADMIN', 'SUPERVISOR')
  assign(@Param('id') id: string, @Body() dto: any, @CurrentStaff() u: any) {
    return this.service.assign(id, dto.assignedToId ?? null, u.id);
  }

  @Get(':id/documents')
  listDocuments(@Param('id') id: string) {
    return this.service.listDocuments(id);
  }

  @Post(':id/documents')
  @Roles('SUPER_ADMIN', 'ADMIN', 'SUPERVISOR', 'ANALYST')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 25 * 1024 * 1024 } }))
  addDocument(
    @Param('id') id: string,
    @UploadedFile() file: any,
    @Body() body: { pastedText?: string },
    @CurrentStaff() u: any,
  ) {
    return this.service.addDocument(id, file, { pastedText: body?.pastedText, staffId: u.id });
  }
}
