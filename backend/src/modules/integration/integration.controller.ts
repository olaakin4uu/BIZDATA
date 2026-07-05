import {
  Body, Controller, Delete, Get, Headers, Param, Post, Req, UseGuards,
  UseInterceptors, UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags, ApiOperation, ApiConsumes, ApiHeader } from '@nestjs/swagger';
import { IntegrationService } from './integration.service';
import { ApiKeyGuard } from './api-key.guard';
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
