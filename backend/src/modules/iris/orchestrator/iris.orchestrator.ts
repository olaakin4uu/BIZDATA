import { Injectable, Logger } from '@nestjs/common';
import type Anthropic from '@anthropic-ai/sdk';
import { LlmFactory } from '../llm/llm.factory';
import { ToolRegistry } from '../tools/tool-registry';
import { ToolExecutor } from '../tools/tool-executor';
import { ToolContext, ConfirmRequired } from '../tools/tool.types';
import { buildIrisSystemPrompt } from './system-prompt';
import { Pseudonymizer } from '../llm/pseudonymizer';

const MAX_ITERATIONS = 6;

export interface IrisTurnResult {
  reply: string;
  messages: Anthropic.MessageParam[]; // full history incl. this turn, real names, for persistence
  cards: ConfirmRequired['card'][]; // confirm cards raised this turn (real names, for the UI)
  usage: { inputTokens: number; outputTokens: number };
}

export interface IrisStreamEvents {
  onDelta?: (text: string) => void; // restored (real-name) text deltas
}

/**
 * The tool-use loop. Hand-rolled so we own the permission gate, confirm handling,
 * per-turn token accounting, and — new in v2 — NAME PSEUDONYMISATION: the stored
 * `messages` carry real names; a per-turn Pseudonymizer tokenises everything sent
 * to the model and restores real names on the way back.
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
    events?: IrisStreamEvents;
  }): Promise<IrisTurnResult> {
    const client = this.llm.create();
    const system = buildIrisSystemPrompt({
      staffName: input.staffName,
      role: input.ctx.role,
      today: new Date().toISOString().slice(0, 10),
    });
    const tools = this.registry.catalogFor(input.ctx.role);
    const pseudo = new Pseudonymizer();

    // Real-name history — persisted and re-pseudonymised each iteration.
    const messages: Anthropic.MessageParam[] = [
      ...input.history,
      { role: 'user', content: input.userMessage },
    ];
    const cards: ConfirmRequired['card'][] = [];
    let inputTokens = 0;
    let outputTokens = 0;
    let reply = '';

    for (let i = 0; i < MAX_ITERATIONS; i++) {
      // Register names from the whole context, then send a tokenised copy.
      pseudo.scanValue(messages);
      const sendMessages = messages.map((m) => ({
        role: m.role,
        content: pseudo.applyValue(m.content),
      })) as Anthropic.MessageParam[];

      const streamed = input.events?.onDelta;
      let res: Anthropic.Message;
      if (streamed) {
        const stream = client.messages.stream({
          model: this.llm.model,
          max_tokens: this.llm.maxTokens,
          system,
          tools: tools as unknown as Anthropic.Tool[],
          messages: sendMessages,
        });
        // Restore each token-space text delta to real names before the UI sees it.
        stream.on('text', (delta: string) => streamed(pseudo.restore(delta)));
        res = await stream.finalMessage();
      } else {
        res = await client.messages.create({
          model: this.llm.model,
          max_tokens: this.llm.maxTokens,
          system,
          tools: tools as unknown as Anthropic.Tool[],
          messages: sendMessages,
        });
      }

      inputTokens += res.usage.input_tokens;
      outputTokens += res.usage.output_tokens;

      // Store the assistant turn with real names restored.
      const restored = pseudo.restoreValue(res.content) as Anthropic.ContentBlockParam[];
      messages.push({ role: 'assistant', content: restored });

      const turnText = (restored as Anthropic.TextBlockParam[])
        .filter((b) => b.type === 'text')
        .map((b) => b.text)
        .join('');
      if (turnText) reply = reply ? `${reply}\n${turnText}` : turnText;

      if (res.stop_reason !== 'tool_use') break;

      const toolUses = res.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const use of toolUses) {
        // The model's tool input is token-space — restore before executing.
        const realInput = pseudo.restoreValue(use.input ?? {}) as Record<string, unknown>;
        const r = await this.executor.run(use.id, use.name, realInput, input.ctx);
        if (r.raw) pseudo.scanValue(r.raw); // register names the result introduced
        if (r.card) cards.push(r.card);
        toolResults.push({ type: 'tool_result', tool_use_id: use.id, content: r.content, is_error: r.isError });
      }
      messages.push({ role: 'user', content: toolResults }); // real names; tokenised next iteration
    }

    return { reply: reply.trim(), messages, cards, usage: { inputTokens, outputTokens } };
  }
}
