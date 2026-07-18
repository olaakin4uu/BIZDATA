import { Global, Module } from '@nestjs/common';
import { ReportableService } from './services/reportable.service';
import { StatutoryModule } from '../modules/statutory/statutory.module';

// Global so every reporting surface can inject ReportableService (the single
// source of truth for the statutory reporting threshold) without importing a
// module each time.
@Global()
@Module({
  imports: [StatutoryModule],
  providers: [ReportableService],
  exports: [ReportableService],
})
export class ReportableModule {}
