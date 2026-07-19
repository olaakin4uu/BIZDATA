import type { User } from '@prisma/client';

/**
 * READ       — pure retrieval; runs immediately.
 * MUTATE     — changes state (run a scan, transition a case); requires confirm.
 * EXPORT_PII — produces a downloadable/printable artifact with taxpayer data;
 *              requires confirm and the output is encrypted.
 * CROSS_ORG  — anything leaving the authority (§29 letters, §15 referrals);
 *              requires confirm.
 */
export type ToolSensitivity = 'READ' | 'MUTATE' | 'EXPORT_PII' | 'CROSS_ORG';

export interface ToolContext {
  staff: User; // the authenticated caller — the server builds this, never the model
  role: string; // staff.role — drives both the catalog filter and the re-check
  conversationId?: string;
}

/**
 * A MUTATE / EXPORT_PII / CROSS_ORG tool NEVER acts. It prepares a draft and
 * returns this sentinel. The executor surfaces `card` to the UI as a confirm
 * card and feeds the model a neutral "awaiting confirmation" note, so the model
 * cannot claim it performed the action. A separate confirm endpoint executes.
 */
export interface ConfirmRequired {
  __confirmRequired: true;
  card: {
    draftId: string;
    kind: string; // 'report' | 'scan' | 'notice'
    title: string;
    summary: string;
    details?: Record<string, unknown>;
  };
}

export interface AgentTool {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Record<string, unknown>; // Anthropic input_schema (JSON Schema)
  readonly sensitivity: ToolSensitivity;
  readonly requiredRoles: string[]; // caller role must be a member
  execute(args: Record<string, unknown>, ctx: ToolContext): Promise<unknown>;
}

export function isConfirmRequired(v: unknown): v is ConfirmRequired {
  return (
    !!v &&
    typeof v === 'object' &&
    (v as { __confirmRequired?: unknown }).__confirmRequired === true
  );
}
