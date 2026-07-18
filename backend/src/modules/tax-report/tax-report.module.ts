import { Module } from '@nestjs/common';
import { TaxReportService } from './tax-report.service';
import { TaxReportController, IntegrationTaxPaymentsController } from './tax-report.controller';
import { IntegrationModule } from '../integration/integration.module';
import { StatutoryModule } from '../statutory/statutory.module';

@Module({
  // IntegrationModule → ApiKeyGuard (partner endpoint); StatutoryModule →
  // StatutoryService (thresholds/rates used by the report).
  imports: [IntegrationModule, StatutoryModule],
  controllers: [TaxReportController, IntegrationTaxPaymentsController],
  providers: [TaxReportService],
  exports: [TaxReportService],
})
export class TaxReportModule {}
