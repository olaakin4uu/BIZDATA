import { Injectable } from '@nestjs/common';
import { AgentTool } from './tool.types';
import { ListCasesTool } from './read/list-cases.tool';
import { RunScanTool } from './action/run-scan.tool';
import { GenerateReportTool } from './action/generate-report.tool';
import { DraftNoticeTool } from './action/draft-notice.tool';

/**
 * Holds every IRIS tool and — critically — builds the per-request tool catalog
 * FILTERED BY THE CALLER'S ROLE. The model is only ever told about tools the
 * user is authorised for, so an unauthorised officer literally cannot ask IRIS
 * to run one. New tools are added to the constructor and registered.
 */
@Injectable()
export class ToolRegistry {
  private readonly tools = new Map<string, AgentTool>();

  constructor(
    listCases: ListCasesTool,
    runScan: RunScanTool,
    generateReport: GenerateReportTool,
    draftNotice: DraftNoticeTool,
  ) {
    for (const t of [listCases, runScan, generateReport, draftNotice]) this.register(t);
  }

  register(tool: AgentTool): void {
    this.tools.set(tool.name, tool);
  }

  get(name: string): AgentTool | undefined {
    return this.tools.get(name);
  }

  /** Anthropic tool definitions for exactly the tools this role may use. */
  catalogFor(role: string): { name: string; description: string; input_schema: Record<string, unknown> }[] {
    return [...this.tools.values()]
      .filter((t) => t.requiredRoles.includes(role))
      .map((t) => ({ name: t.name, description: t.description, input_schema: t.inputSchema }));
  }
}
