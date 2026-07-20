import { Module } from '@nestjs/common';
import { ScanModule } from '../scan/scan.module';
import { CasesModule } from '../cases/cases.module';
import { IrisController } from './iris.controller';
import { IrisService } from './iris.service';
import { IrisOrchestrator } from './orchestrator/iris.orchestrator';
import { LlmFactory } from './llm/llm.factory';
import { ToolRegistry } from './tools/tool-registry';
import { ToolExecutor } from './tools/tool-executor';
import { DraftProposer } from './approval/draft-proposer';
import { IrisDraftService } from './approval/iris-draft.service';
import { ExportService } from './export/export.service';
import { ListCasesTool } from './tools/read/list-cases.tool';
import { ExplainCaseTool } from './tools/read/explain-case.tool';
import { TaxpayerSummaryTool } from './tools/read/taxpayer-summary.tool';
import { ScanResultsTool } from './tools/read/scan-results.tool';
import { RunScanTool } from './tools/action/run-scan.tool';
import { GenerateReportTool } from './tools/action/generate-report.tool';
import { DraftNoticeTool } from './tools/action/draft-notice.tool';

/**
 * IRIS — the agentic AI assistant. CommonModule (Audit/Crypto/PII/RequestContext)
 * and PrismaModule are @Global, so they're injectable without importing.
 * ScanModule/CasesModule are imported for the action tools' commit() step.
 */
@Module({
  imports: [ScanModule, CasesModule],
  controllers: [IrisController],
  providers: [
    LlmFactory,
    ToolRegistry,
    ToolExecutor,
    IrisOrchestrator,
    IrisService,
    DraftProposer,
    IrisDraftService,
    ExportService,
    // Tools
    ListCasesTool,
    ExplainCaseTool,
    TaxpayerSummaryTool,
    ScanResultsTool,
    RunScanTool,
    GenerateReportTool,
    DraftNoticeTool,
  ],
})
export class IrisModule {}
