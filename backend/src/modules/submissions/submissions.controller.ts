import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SubmissionsService } from './submissions.service';
import { StaffAuthGuard } from '../../common/guards/staff-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentStaff } from '../../common/decorators/current-staff.decorator';

@ApiTags('Submissions')
@ApiBearerAuth()
@UseGuards(StaffAuthGuard, RolesGuard)
@Controller('submissions')
export class SubmissionsController {
  constructor(private service: SubmissionsService) {}

  @Post('upload')
  @Roles('SUPER_ADMIN', 'ADMIN', 'ANALYST', 'SUPERVISOR')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 100 * 1024 * 1024 } }))
  async upload(
    @UploadedFile() file: any,
    @Body() body: any,
    @CurrentStaff() u: any,
  ) {
    if (!file) throw new BadRequestException('file is required');
    if (!body.providerId) throw new BadRequestException('providerId is required');
    if (!body.periodLabel) throw new BadRequestException('periodLabel is required');

    return this.service.upload({
      providerId: body.providerId,
      fileName: file.originalname,
      fileBuffer: file.buffer,
      periodLabel: body.periodLabel,
      periodYear: body.periodYear ? parseInt(body.periodYear, 10) : undefined,
      periodQuarter: body.periodQuarter ? parseInt(body.periodQuarter, 10) : undefined,
      periodMonth: body.periodMonth ? parseInt(body.periodMonth, 10) : undefined,
      submittedByStaffId: u.id,
      checksum: body.checksum || undefined,
    });
  }

  // ─── Large-file split upload (§6.4) ─────────────────────────────────────────

  @Post('multipart/init')
  @Roles('SUPER_ADMIN', 'ADMIN', 'ANALYST', 'SUPERVISOR')
  @ApiOperation({ summary: 'Start a split upload for a large file (returns uploadId)' })
  initMultipart(@Body() body: any, @CurrentStaff() u: any) {
    if (!body.providerId) throw new BadRequestException('providerId is required');
    if (!body.fileName) throw new BadRequestException('fileName is required');
    if (!body.periodLabel) throw new BadRequestException('periodLabel is required');
    if (!body.totalParts) throw new BadRequestException('totalParts is required');
    return this.service.initMultipart({
      providerId: body.providerId,
      fileName: body.fileName,
      periodLabel: body.periodLabel,
      totalParts: parseInt(body.totalParts, 10),
      expectedChecksum: body.checksum || undefined,
      submittedByStaffId: u.id,
    });
  }

  @Post('multipart/:uploadId/part')
  @Roles('SUPER_ADMIN', 'ADMIN', 'ANALYST', 'SUPERVISOR')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload one part of a split file' })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 100 * 1024 * 1024 } }))
  uploadPart(
    @Param('uploadId') uploadId: string,
    @UploadedFile() file: any,
    @Body() body: any,
  ) {
    if (!file) throw new BadRequestException('file (part) is required');
    if (body.partNumber == null) throw new BadRequestException('partNumber is required');
    return this.service.uploadPart(uploadId, parseInt(body.partNumber, 10), file.buffer, body.checksum || undefined);
  }

  @Post('multipart/:uploadId/complete')
  @Roles('SUPER_ADMIN', 'ADMIN', 'ANALYST', 'SUPERVISOR')
  @ApiOperation({ summary: 'Reassemble + verify + ingest a completed split upload' })
  completeMultipart(@Param('uploadId') uploadId: string) {
    return this.service.completeMultipart(uploadId);
  }

  @Post('multipart/:uploadId/abort')
  @Roles('SUPER_ADMIN', 'ADMIN', 'ANALYST', 'SUPERVISOR')
  abortMultipart(@Param('uploadId') uploadId: string) {
    return this.service.abortMultipart(uploadId);
  }

  @Get(':id/report')
  report(@Param('id') id: string) {
    return this.service.report(id);
  }

  @Post('ingest-json')
  @Roles('SUPER_ADMIN', 'ADMIN', 'ANALYST', 'SUPERVISOR')
  async ingestJson(@Body() body: any, @CurrentStaff() u: any) {
    if (!body.providerId) throw new BadRequestException('providerId is required');
    if (!body.periodQuarter && !body.periodLabel) throw new BadRequestException('periodQuarter is required');
    return this.service.ingestJson({
      providerId: body.providerId,
      periodQuarter: body.periodQuarter || body.periodLabel,
      records: body.records,
      checksum: body.checksum || undefined,
      submittedByStaffId: u.id,
    });
  }

  @Get()
  findAll(@Query() q: any) {
    return this.service.findAll(q);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id/process')
  @Roles('SUPER_ADMIN', 'ADMIN')
  reprocess(@Param('id') id: string) {
    return this.service.reprocess(id);
  }
}
