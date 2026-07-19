import { Injectable, Logger } from '@nestjs/common';
import type Anthropic from '@anthropic-ai/sdk';
import { LlmFactory } from '../llm/llm.factory';
import { ToolRegistry } from '../tools/tool-registry';
import { ToolExecutor } from '../tools/tool-executor';
import { ToolContext, ConfirmRequired } from '../tools/tool.types';
import { buildIrisSystemPrompt } from './system-prompt';
import { redactPii } from '../llm/redaction';

const MAX_ITERATIONS = 6;

export interface IrisTurnResult {
  reply: string;
  messages: Anthropic.MessageParam[]; // full history incl. this turn, for persistence
  cards: ConfirmRequired['card'][]; // confirm cards raised this turn
  usage: { inputTokens: number; outputTokens: number };
}

/**
 * The tool-use loop. Hand-rolled (like ilobyte's orchestrators) so we own the
 * permission gate, the confirm handling, and per-turn token accounting.
 */
@Injectable()
export class IrisOrchestrator {
  private readonly logger = new Logger(IrisOrchestrator.name);

  constructor(
    private llm: LlmFactory,
    private registry: ToolRegistry,
    private executor: ToolExecutor,
  ) {}

  async runTurn(input: {
    history: Anthropic.MessageParam[];
    userMessage: string;
    ctx: ToolContext;
    staffName: string;
  }): Promise<IrisTurnResult> {
    const client = this.llm.create();
    const system = buildIrisSystemPrompt({
      staffName: input.staffName,
      role: input.ctx.role,
      today: new Date().toISOString().slice(0, 10),
    });
    const tools = this.registry.catalogFor(input.ctx.role);

    const messages: Anthropic.MessageParam[] = [
      ...input.history,
      { role: 'user', content: redactPii(input.userMessage) },
    ];
    const cards: ConfirmRequired['card'][] = [];
    let inputTokens = 0;
    let outputTokens = 0;
    let reply = '';

    for (let i = 0; i < MAX_ITERATIONS; i++) {
      const res = await client.messages.create({
        model: this.llm.model,
        max_tokens: this.llm.maxTokens,
        system,
        tools: tools as unknown as Anthropic.Tool[],
        messages,
      });
      inputTokens += res.usage.input_tokens;
      outputTokens += res.usage.output_tokens;

      messages.push({ role: 'assistant', content: res.content as unknown as Anthropic.ContentBlockParam[] });

      const turnText = res.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('');
      if (turnText) reply = reply ? `${reply}\n${turnText}` : turnText;

      if (res.stop_reason !== 'tool_use') break;

      const toolUses = res.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const use of toolUses) {
        const r = await this.executor.run(use.id, use.name, (use.input ?? {}) as Record<string, unknown>, input.ctx);
        if (r.card) cards.push(r.card);
        toolResults.push({
          type: 'tool_result',
          tool_use_id: use.id,
          content: redactPii(r.content),
          is_error: r.isError,
        });
      }
      messages.push({ role: 'user', content: toolResults });
    }

    return { reply: reply.trim(), messages, cards, usage: { inputTokens, outputTokens } };
  }
}
