import { Module } from '@nestjs/common';
import { CasesModule } from '../cases/cases.module';
import { LlmModule } from '../iris/llm/llm.module';
import { TriageController } from './triage.controller';
import { TriageService } from './triage.service';

/**
 * IRIS Case Triage. Reuses CasesService (the real transition/assessment path)
 * and the shared LlmModule (Claude seam). CommonModule (Audit) and PrismaModule
 * are @Global.
 */
@Module({
  imports: [CasesModule, LlmModule],
  controllers: [TriageController],
  providers: [TriageService],
})
export class TriageModule {}
