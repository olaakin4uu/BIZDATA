import { AgentTool, ToolContext } from '../tools/tool.types';

export interface CommitResult {
  message: string;
  resultRef?: string; // id of the entity/artifact produced
  download?: { exportId: string; fileName: string }; // for encrypted exports
}

/**
 * An ActionTool proposes a draft in execute() (the approval gate) and performs
 * the real work in commit(), which runs only after the officer confirms. `kind`
 * matches IrisDraft.kind so IrisDraftService can route a confirm to the right tool.
 */
export interface ActionTool extends AgentTool {
  readonly kind: string; // 'scan' | 'report' | 'notice'
  commit(payload: Record<string, unknown>, ctx: ToolContext): Promise<CommitResult>;
}
