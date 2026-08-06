import { Module } from '@nestjs/common';
import { TaxReportService } from './tax-report.service';
import { TaxReportController, IntegrationTaxPaymentsController } from './tax-report.controller';
import { IntegrationModule } from '../integration/integration.module';
import { StatutoryModule } from '../statutory/statutory.module';
import { AccessModule } from '../access/access.module';
import { ExportModule } from '../iris/export/export.module';

@Module({
  // IntegrationModule → ApiKeyGuard (partner endpoint); StatutoryModule →
  // StatutoryService (thresholds/rates used by the report); AccessModule →
  // case-level need-to-know enforcement on the printable report.
  imports: [IntegrationModule, StatutoryModule, AccessModule, ExportModule],
  controllers: [TaxReportController, IntegrationTaxPaymentsController],
  providers: [TaxReportService],
  exports: [TaxReportService],
})
export class TaxReportModule {}
