import { Module } from '@nestjs/common';
import { ProvidersService } from './providers.service';
import { ProvidersController } from './providers.controller';
import { ProviderComplianceService } from './provider-compliance.service';

@Module({
  controllers: [ProvidersController],
  providers: [ProvidersService, ProviderComplianceService],
  exports: [ProvidersService],
})
export class ProvidersModule {}
