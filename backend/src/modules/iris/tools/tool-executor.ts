import { Injectable } from '@nestjs/common';
import { ToolRegistry } from './tool-registry';
import { ToolContext, isConfirmRequired, ConfirmRequired } from './tool.types';
import { AuditService } from '../../../common/services/audit.service';

export interface ToolRunResult {
  toolUseId: string;
  content: string; // JSON string fed back to the model as the tool_result
  isError: boolean;
  card?: ConfirmRequired['card']; // surfaced to the UI when a draft needs confirming
}

/**
 * Runs one tool call. Enforces the SECOND permission layer (defence in depth —
 * the catalog already hid the tool) and converts a confirm sentinel into a
 * neutral note for the model + a card for the UI. Every tool call is written to
 * the hash-chained audit log.
 */
@Injectable()
export class ToolExecutor {
  constructor(
    private registry: ToolRegistry,
    private audit: AuditService,
  ) {}

  async run(toolUseId: string, name: string, args: Record<string, unknown>, ctx: ToolContext): Promise<ToolRunResult> {
    const tool = this.registry.get(name);
    if (!tool) {
      return { toolUseId, content: JSON.stringify({ error: `Unknown tool "${name}".` }), isError: true };
    }
    // Hard re-check — a denial is returned as DATA (not an error) so the model
    // explains it politely instead of retrying.
    if (!tool.requiredRoles.includes(ctx.role)) {
      return {
        toolUseId,
        content: JSON.stringify({ denied: true, reason: `Your role (${ctx.role}) is not permitted to use "${name}".` }),
        isError: false,
      };
    }

    try {
      const result = await tool.execute(args, ctx);

      await this.audit.log({
        actorType: 'STAFF',
        actorId: ctx.staff.id,
        staffId: ctx.staff.id,
        action: `IRIS_TOOL:${name}`,
        entity: 'IrisTool',
        afterJson: { sensitivity: tool.sensitivity, args },
      });

      if (isConfirmRequired(result)) {
        return {
          toolUseId,
          content: JSON.stringify({
            status: 'awaiting_user_confirmation',
            message: 'A draft has been prepared. Tell the user it is ready on a card for their review and confirmation. Do NOT claim you performed the action.',
          }),
          isError: false,
          card: result.card,
        };
      }

      return { toolUseId, content: JSON.stringify(result), isError: false };
    } catch (e) {
      return { toolUseId, content: JSON.stringify({ error: (e as Error).message }), isError: true };
    }
  }
}
