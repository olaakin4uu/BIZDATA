import { Module } from '@nestjs/common';
import { CrossStateService } from './cross-state.service';
import { CrossStateController } from './cross-state.controller';

@Module({
  controllers: [CrossStateController],
  providers: [CrossStateService],
})
export class CrossStateModule {}
