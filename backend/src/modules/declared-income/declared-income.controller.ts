import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { DeclaredIncomeService } from './declared-income.service';
import { StaffAuthGuard } from '../../common/guards/staff-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentStaff } from '../../common/decorators/current-staff.decorator';

@ApiTags('Declared Income')
@ApiBearerAuth()
@UseGuards(StaffAuthGuard, RolesGuard)
@Controller('declared-income')
export class DeclaredIncomeController {
  constructor(private service: DeclaredIncomeService) {}

  @Post()
  @Roles('SUPER_ADMIN', 'ADMIN', 'ANALYST')
  create(@Body() dto: any, @CurrentStaff() u: any) {
    return this.service.create(dto, u.id);
  }

  @Get()
  findAll(@Query() q: any) {
    return this.service.findAll(q);
  }

  @Get('template')
  @ApiOperation({ summary: 'Download a sample declared-income CSV template' })
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="declared-income-template.csv"')
  template(@Res() res: Response) {
    res.send(this.service.sampleTemplate());
  }

  @Post('validate')
  @Roles('SUPER_ADMIN', 'ADMIN')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Dry-run a CSV — validate and preview without writing' })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 100 * 1024 * 1024 } }))
  async validateCsv(@UploadedFile() file: any, @CurrentStaff() u: any) {
    if (!file) throw new BadRequestException('file is required');
    return this.service.processCsv(file.buffer.toString('utf8'), { dryRun: true, actorId: u.id });
  }

  @Post('import')
  @Roles('SUPER_ADMIN', 'ADMIN')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Import a CSV — writes declared-income records' })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 100 * 1024 * 1024 } }))
  async importCsv(@UploadedFile() file: any, @CurrentStaff() u: any) {
    if (!file) throw new BadRequestException('file is required');
    return this.service.processCsv(file.buffer.toString('utf8'), { dryRun: false, actorId: u.id });
  }
}
