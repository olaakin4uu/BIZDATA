import { Module } from '@nestjs/common';
import { ExportService } from './export.service';

/**
 * Split out from IrisModule so it can be imported by other feature modules
 * (Cases, TaxReport) without a circular dependency — IrisModule already
 * imports CasesModule for its action tools' commit() step, so ExportService
 * can't live inside IrisModule if Cases needs it too.
 */
@Module({
  providers: [ExportService],
  exports: [ExportService],
})
export class ExportModule {}
