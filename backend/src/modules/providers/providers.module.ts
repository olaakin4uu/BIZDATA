import { Module } from '@nestjs/common';
import { ProvidersService } from './providers.service';
import { ProvidersController } from './providers.controller';
import { ProviderComplianceService } from './provider-compliance.service';
import { AuthModule } from '../auth/auth.module';
import { StatutoryModule } from '../statutory/statutory.module';

@Module({
  imports: [AuthModule, StatutoryModule],
  controllers: [ProvidersController],
  providers: [ProvidersService, ProviderComplianceService],
  exports: [ProvidersService, ProviderComplianceService],
})
export class ProvidersModule {}
