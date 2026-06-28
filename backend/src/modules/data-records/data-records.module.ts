import { Module } from '@nestjs/common';
import { DataRecordsService } from './data-records.service';
import { DataRecordsController } from './data-records.controller';

@Module({
  controllers: [DataRecordsController],
  providers: [DataRecordsService],
})
export class DataRecordsModule {}
