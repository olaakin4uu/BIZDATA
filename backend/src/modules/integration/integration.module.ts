import { Module } from '@nestjs/common';
import { IntegrationService } from './integration.service';
import {
  IntegrationKeysController,
  IntegrationTaxpayerController,
  IntegrationDeclaredIncomeController,
} from './integration.controller';
import { ApiKeyGuard } from './api-key.guard';
import { CasesModule } from '../cases/cases.module';
import { DeclaredIncomeModule } from '../declared-income/declared-income.module';

@Module({
  imports: [CasesModule, DeclaredIncomeModule],
  controllers: [IntegrationKeysController, IntegrationTaxpayerController, IntegrationDeclaredIncomeController],
  providers: [IntegrationService, ApiKeyGuard],
})
export class IntegrationModule {}
