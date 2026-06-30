import { Module } from '@nestjs/common';
import { AgentsService } from './agents.service';
import { AgentsController } from './agents.controller';
import { BenchmarkingService } from './benchmarking.service';

@Module({
  controllers: [AgentsController],
  providers: [AgentsService, BenchmarkingService],
  exports: [AgentsService],
})
export class AgentsModule {}
