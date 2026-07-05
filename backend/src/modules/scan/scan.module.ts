import { Module } from '@nestjs/common';
import { ScanService } from './scan.service';
import { ScanController } from './scan.controller';
import { PortfoliosModule } from '../portfolios/portfolios.module';
import { StatutoryModule } from '../statutory/statutory.module';

@Module({
  imports: [PortfoliosModule, StatutoryModule],
  controllers: [ScanController],
  providers: [ScanService],
  exports: [ScanService],
})
export class ScanModule {}
