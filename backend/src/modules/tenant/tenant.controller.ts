import { BadRequestException, Body, Controller, Get, Patch, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { TenantService } from './tenant.service';
import { StaffAuthGuard } from '../../common/guards/staff-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('Tenant')
@ApiBearerAuth()
@UseGuards(StaffAuthGuard, RolesGuard)
@Controller('tenant')
export class TenantController {
  constructor(private service: TenantService) {}

  @Get()
  get() {
    return this.service.get();
  }

  @Patch()
  @Roles('SUPER_ADMIN', 'ADMIN')
  update(@Body() dto: any) {
    return this.service.update(dto);
  }

  @Post('logo')
  @Roles('SUPER_ADMIN', 'ADMIN')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 1024 * 1024 } })) // 1 MB
  uploadLogo(@UploadedFile() file: any) {
    if (!file) throw new BadRequestException('file is required');
    if (!/^image\/(png|jpe?g|svg\+xml|webp)$/.test(file.mimetype)) {
      throw new BadRequestException('Logo must be PNG, JPEG, SVG or WebP');
    }
    return this.service.setLogo(file.buffer, file.mimetype);
  }
}

// Public (unauthenticated) branding for the login screen.
@ApiTags('Tenant')
@Controller('tenant')
export class TenantPublicController {
  constructor(private service: TenantService) {}

  @Get('branding')
  branding() {
    return this.service.branding();
  }
}
