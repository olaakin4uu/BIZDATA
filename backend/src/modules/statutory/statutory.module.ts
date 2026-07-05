import { Module } from '@nestjs/common';
import { StatutoryService } from './statutory.service';
import { StatutoryController } from './statutory.controller';

@Module({
  controllers: [StatutoryController],
  providers: [StatutoryService],
  exports: [StatutoryService],
})
export class StatutoryModule {}
