import {
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
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { TaxpayersService } from './taxpayers.service';
import { StaffAuthGuard } from '../../common/guards/staff-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentStaff } from '../../common/decorators/current-staff.decorator';

@ApiTags('Taxpayers')
@ApiBearerAuth()
@UseGuards(StaffAuthGuard, RolesGuard)
@Controller('taxpayers')
export class TaxpayersController {
  constructor(private service: TaxpayersService) {}

  @Post()
  @Roles('SUPER_ADMIN', 'ADMIN', 'ANALYST', 'SUPERVISOR')
  create(@Body() dto: any, @CurrentStaff() u: any) {
    return this.service.create(dto, u.id);
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
  @Roles('SUPER_ADMIN', 'ADMIN', 'ANALYST', 'SUPERVISOR')
  update(@Param('id') id: string, @Body() dto: any, @CurrentStaff() u: any) {
    return this.service.update(id, dto, u.id);
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
