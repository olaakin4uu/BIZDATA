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
import { ProviderPortalService } from './provider-portal.service';
import { SubmissionsService } from '../submissions/submissions.service';
import { AuthService } from '../auth/auth.service';
import { ProviderAuthGuard } from '../../common/guards/provider-auth.guard';
import { CurrentProviderUser } from '../../common/decorators/current-provider-user.decorator';

@ApiTags('Provider Portal')
@ApiBearerAuth()
@UseGuards(ProviderAuthGuard)
@Controller('provider-portal')
export class ProviderPortalController {
  constructor(
    private service: ProviderPortalService,
    private submissions: SubmissionsService,
    private auth: AuthService,
  ) {}

  @Get('me')
  me(@CurrentProviderUser() u: any) {
    return this.service.me(u.id);
  }

  @Get('dashboard')
  dashboard(@CurrentProviderUser() u: any) {
    return this.service.dashboard(u.providerId);
  }

  @Get('submissions')
  listSubmissions(@CurrentProviderUser() u: any, @Query() q: any) {
    return this.service.listSubmissions(u.providerId, q);
  }

  @Post('submissions/upload')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 100 * 1024 * 1024 } }))
  async upload(
    @UploadedFile() file: any,
    @Body() body: any,
    @CurrentProviderUser() u: any,
  ) {
    if (!file) throw new BadRequestException('file is required');
    if (!body.periodLabel) throw new BadRequestException('periodLabel is required');

    return this.submissions.upload({
      providerId: u.providerId,
      fileName: file.originalname,
      fileBuffer: file.buffer,
      periodLabel: body.periodLabel,
      periodYear: body.periodYear ? parseInt(body.periodYear, 10) : undefined,
      periodQuarter: body.periodQuarter ? parseInt(body.periodQuarter, 10) : undefined,
      periodMonth: body.periodMonth ? parseInt(body.periodMonth, 10) : undefined,
      submittedByUserId: u.id,
    });
  }

  @Get('submissions/:id')
  getSubmission(@CurrentProviderUser() u: any, @Param('id') id: string) {
    return this.service.getSubmission(u.providerId, id);
  }

  @Patch('me/password')
  changePassword(@CurrentProviderUser() u: any, @Body() dto: { currentPassword: string; newPassword: string }) {
    return this.auth.changeProviderPassword(u.id, dto.currentPassword, dto.newPassword);
  }
}
