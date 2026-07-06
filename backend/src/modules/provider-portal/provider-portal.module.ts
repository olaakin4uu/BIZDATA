import { Module } from '@nestjs/common';
import { ProviderPortalService } from './provider-portal.service';
import { ProviderPortalController } from './provider-portal.controller';
import { SubmissionsModule } from '../submissions/submissions.module';
import { AuthModule } from '../auth/auth.module';
import { ProvidersModule } from '../providers/providers.module';

@Module({
  imports: [SubmissionsModule, AuthModule, ProvidersModule],
  controllers: [ProviderPortalController],
  providers: [ProviderPortalService],
})
export class ProviderPortalModule {}
