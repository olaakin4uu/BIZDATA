import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
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

  @Post('import')
  @Roles('SUPER_ADMIN', 'ADMIN')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 100 * 1024 * 1024 } }))
  async importCsv(@UploadedFile() file: any, @CurrentStaff() u: any) {
    if (!file) throw new BadRequestException('file is required');
    return this.service.importCsv(file.buffer.toString('utf8'), u.id);
  }
}
