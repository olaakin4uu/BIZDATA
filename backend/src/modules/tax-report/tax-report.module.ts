import { Module } from '@nestjs/common';
import { TaxReportService } from './tax-report.service';
import { TaxReportController, IntegrationTaxPaymentsController } from './tax-report.controller';
import { IntegrationModule } from '../integration/integration.module';

@Module({
  imports: [IntegrationModule], // ApiKeyGuard for the partner endpoint
  controllers: [TaxReportController, IntegrationTaxPaymentsController],
  providers: [TaxReportService],
  exports: [TaxReportService],
})
export class TaxReportModule {}
