import { Module } from '@nestjs/common';
import { NdpaService } from './ndpa.service';
import { NdpaController } from './ndpa.controller';

@Module({
  controllers: [NdpaController],
  providers: [NdpaService],
})
export class NdpaModule {}
