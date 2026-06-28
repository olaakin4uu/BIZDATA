import { Module } from '@nestjs/common';
import { TaxpayersService } from './taxpayers.service';
import { TaxpayersController } from './taxpayers.controller';

@Module({
  controllers: [TaxpayersController],
  providers: [TaxpayersService],
})
export class TaxpayersModule {}
