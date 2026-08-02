import { Module } from '@nestjs/common';
import { DataQualityService } from './data-quality.service';
import { DataQualityController } from './data-quality.controller';

@Module({
  controllers: [DataQualityController],
  providers: [DataQualityService],
})
export class DataQualityModule {}
