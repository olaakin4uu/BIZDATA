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
  messages: Anthropic.MessageParam[]; // full history incl. this turn, real names, thinking stripped
  cards: ConfirmRequired['card'][]; // confirm cards raised this turn (real names, for the UI)
  usage: { inputTokens: number; outputTokens: number };
}

export interface IrisStreamEvents {
  onDelta?: (text: string) => void; // restored (real-name) answer text
  onThinking?: (text: string) => void; // restored summarised reasoning
  onTool?: (name: string) => void; // a tool is about to run (for a progress hint)
}

function stripThinking(content: unknown): unknown {
  if (!Array.isArray(content)) return content;
  return content.filter((b) => {
    const t = (b as { type?: string } | null)?.type;
    return t !== 'thinking' && t !== 'redacted_thinking';
  });
}

/**
 * The tool-use loop. Hand-rolled so we own the permission gate, confirm handling,
 * token accounting, NAME PSEUDONYMISATION, and — new — ADAPTIVE THINKING: IRIS
 * reasons before answering and streams a summarised chain of thought. Signed
 * thinking blocks are preserved verbatim during the turn and stripped before we
 * persist (they're the model's scratchpad, not history).
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

    const messages: Anthropic.MessageParam[] = [...input.history, { role: 'user', content: input.userMessage }];
    const cards: ConfirmRequired['card'][] = [];
    let inputTokens = 0;
    let outputTokens = 0;
    let reply = '';

    const onText = input.events?.onDelta;
    const onThink = input.events?.onThinking;

    for (let i = 0; i < MAX_ITERATIONS; i++) {
      pseudo.scanValue(messages);
      const sendMessages = messages.map((m) => ({ role: m.role, content: pseudo.applyValue(m.content) })) as Anthropic.MessageParam[];

      const req = {
        model: this.llm.model,
        max_tokens: this.llm.maxTokens,
        system,
        tools: tools as unknown as Anthropic.Tool[],
        messages: sendMessages,
        thinking: { type: 'adaptive', display: 'summarized' },
        output_config: { effort: this.llm.effort },
      } as unknown as Anthropic.MessageCreateParamsNonStreaming;

      let res: Anthropic.Message;
      if (onText || onThink) {
        const stream = client.messages.stream(req);
        for await (const event of stream) {
          if (event.type === 'content_block_delta') {
            if (event.delta.type === 'text_delta') onText?.(pseudo.restore(event.delta.text));
            else if (event.delta.type === 'thinking_delta') onThink?.(pseudo.restore(event.delta.thinking));
          }
        }
        res = await stream.finalMessage();
      } else {
        res = await client.messages.create(req);
      }

      inputTokens += res.usage.input_tokens;
      outputTokens += res.usage.output_tokens;

      // Preserve full content (incl. signed thinking) during the turn so the
      // next iteration's tool_result send has a valid thinking block.
      const restored = pseudo.restoreValue(res.content) as Anthropic.ContentBlockParam[];
      messages.push({ role: 'assistant', content: restored });

      const turnText = res.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => pseudo.restore(b.text))
        .join('');
      if (turnText) reply = reply ? `${reply}\n${turnText}` : turnText;

      if (res.stop_reason !== 'tool_use') break;

      const toolUses = res.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const use of toolUses) {
        input.events?.onTool?.(use.name);
        const realInput = pseudo.restoreValue(use.input ?? {}) as Record<string, unknown>;
        const r = await this.executor.run(use.id, use.name, realInput, input.ctx);
        if (r.raw) pseudo.scanValue(r.raw);
        if (r.card) cards.push(r.card);
        toolResults.push({ type: 'tool_result', tool_use_id: use.id, content: r.content, is_error: r.isError });
      }
      messages.push({ role: 'user', content: toolResults });
    }

    // Strip signed thinking blocks before returning for persistence/replay.
    const cleaned = messages.map((m) => ({ role: m.role, content: stripThinking(m.content) })) as Anthropic.MessageParam[];
    return { reply: reply.trim(), messages: cleaned, cards, usage: { inputTokens, outputTokens } };
  }
}
