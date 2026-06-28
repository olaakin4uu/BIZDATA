import { Module } from '@nestjs/common';
import { ProviderPortalService } from './provider-portal.service';
import { ProviderPortalController } from './provider-portal.controller';
import { SubmissionsModule } from '../submissions/submissions.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [SubmissionsModule, AuthModule],
  controllers: [ProviderPortalController],
  providers: [ProviderPortalService],
})
export class ProviderPortalModule {}
