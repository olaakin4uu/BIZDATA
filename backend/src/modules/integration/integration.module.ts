import { Module } from '@nestjs/common';
import { IntegrationService } from './integration.service';
import { IntegrationKeysController, IntegrationTaxpayerController } from './integration.controller';
import { ApiKeyGuard } from './api-key.guard';
import { CasesModule } from '../cases/cases.module';

@Module({
  imports: [CasesModule],
  controllers: [IntegrationKeysController, IntegrationTaxpayerController],
  providers: [IntegrationService, ApiKeyGuard],
})
export class IntegrationModule {}
