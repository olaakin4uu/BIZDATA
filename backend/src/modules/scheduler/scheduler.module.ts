import { Module } from '@nestjs/common';
import { SchedulerService } from './scheduler.service';
import { SchedulerController } from './scheduler.controller';
import { ScanModule } from '../scan/scan.module';
import { AgentsModule } from '../agents/agents.module';
import { CasesModule } from '../cases/cases.module';
import { ProvidersModule } from '../providers/providers.module';

@Module({
  imports: [ScanModule, AgentsModule, CasesModule, ProvidersModule],
  controllers: [SchedulerController],
  providers: [SchedulerService],
})
export class SchedulerModule {}
