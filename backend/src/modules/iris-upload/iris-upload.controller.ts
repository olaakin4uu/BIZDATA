import { Body, Controller, Param, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { IrisUploadService } from './iris-upload.service';
import { ProviderAuthGuard } from '../../common/guards/provider-auth.guard';
import { CurrentProviderUser } from '../../common/decorators/current-provider-user.decorator';

/**
 * IRIS Upload Assistant — provider-facing. analyze proposes a cleanup, revalidate
 * re-checks the provider's edited mapping live, approve pushes the cleaned file
 * through the normal upload pipeline (all rules enforced).
 */
@ApiTags('IRIS Upload Assistant')
@ApiBearerAuth()
@UseGuards(ProviderAuthGuard)
@Controller('provider-portal/import')
export class IrisUploadController {
  constructor(private service: IrisUploadService) {}

  @Post('analyze')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 50 * 1024 * 1024 } }))
  analyze(@UploadedFile() file: any, @Body() body: any, @CurrentProviderUser() u: any) {
    return this.service.analyze(
      { providerId: u.providerId, providerUserId: u.id },
      file,
      {
        periodLabel: body.periodLabel,
        periodYear: body.periodYear ? parseInt(body.periodYear, 10) : undefined,
        periodQuarter: body.periodQuarter ? parseInt(body.periodQuarter, 10) : undefined,
        periodMonth: body.periodMonth ? parseInt(body.periodMonth, 10) : undefined,
      },
    );
  }

  @Post(':id/revalidate')
  revalidate(@Param('id') id: string, @Body() body: any, @CurrentProviderUser() u: any) {
    return this.service.revalidate({ providerId: u.providerId, providerUserId: u.id }, id, body?.mapping ?? []);
  }

  @Post(':id/approve')
  approve(@Param('id') id: string, @CurrentProviderUser() u: any) {
    return this.service.approve({ providerId: u.providerId, providerUserId: u.id }, id);
  }

  @Post(':id/cancel')
  cancel(@Param('id') id: string, @CurrentProviderUser() u: any) {
    return this.service.cancel({ providerId: u.providerId, providerUserId: u.id }, id);
  }
}
