import { Module } from '@nestjs/common';
import { TaxNetService } from './tax-net.service';
import { TaxNetController } from './tax-net.controller';

@Module({
  controllers: [TaxNetController],
  providers: [TaxNetService],
})
export class TaxNetModule {}
