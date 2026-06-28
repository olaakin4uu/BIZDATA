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
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
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
