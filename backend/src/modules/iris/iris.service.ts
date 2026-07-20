import { Injectable, NotFoundException } from '@nestjs/common';
import type { User, Prisma, IrisConversation, IrisMessage } from '@prisma/client';
import type Anthropic from '@anthropic-ai/sdk';
import { PrismaService } from '../../prisma/prisma.service';
import { IrisOrchestrator, IrisTurnResult } from './orchestrator/iris.orchestrator';
import { LlmFactory } from './llm/llm.factory';
import { costUsdMicros } from './llm/cost';
import { IrisChatDto } from './dto/iris-chat.dto';

export interface IrisChatResult {
  conversationId: string;
  reply: string;
  cards: unknown[];
}

export type IrisStreamEvent =
  | { type: 'thinking'; text: string }
  | { type: 'tool'; name: string }
  | { type: 'delta'; text: string }
  | { type: 'done'; conversationId: string; reply: string; cards: unknown[] }
  | { type: 'error'; message: string };

function messageText(m: IrisMessage): string {
  if (m.text) return m.text;
  const blocks = m.blocks as unknown;
  if (Array.isArray(blocks)) {
    return blocks
      .filter((b): b is { type: string; text: string } => !!b && typeof b === 'object' && (b as { type?: string }).type === 'text')
      .map((b) => b.text)
      .join('');
  }
  return '';
}

/** Facade for a chat turn: conversation resolution, history replay, orchestration,
 *  persistence, and COGS logging — shared by the blocking and streaming paths. */
@Injectable()
export class IrisService {
  constructor(
    private prisma: PrismaService,
    private orchestrator: IrisOrchestrator,
    private llm: LlmFactory,
  ) {}

  private async resolveConversation(staff: User, conversationId: string | undefined, seed: string): Promise<IrisConversation> {
    if (conversationId) {
      const found = await this.prisma.irisConversation.findFirst({ where: { id: conversationId, staffId: staff.id } });
      if (found) return found;
    }
    return this.prisma.irisConversation.create({ data: { staffId: staff.id, title: seed.slice(0, 60) } });
  }

  private async loadHistory(conversationId: string): Promise<Anthropic.MessageParam[]> {
    const prior = await this.prisma.irisMessage.findMany({ where: { conversationId }, orderBy: { createdAt: 'asc' } });
    return prior
      .filter((m) => m.blocks != null)
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.blocks as unknown as Anthropic.ContentBlockParam[] }));
  }

  private async persistTurn(convo: IrisConversation, history: Anthropic.MessageParam[], result: IrisTurnResult, staff: User): Promise<void> {
    const fresh = result.messages.slice(history.length);
    for (const m of fresh) {
      await this.prisma.irisMessage.create({
        data: {
          conversationId: convo.id,
          role: String(m.role),
          text: typeof m.content === 'string' ? m.content : null,
          blocks: m.content as unknown as Prisma.InputJsonValue,
        },
      });
    }
    await this.prisma.irisConversation.update({ where: { id: convo.id }, data: { updatedAt: new Date() } });
    await this.prisma.irisUsage.create({
      data: {
        staffId: staff.id,
        conversationId: convo.id,
        feature: 'chat',
        model: this.llm.model,
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
        costUsdMicros: costUsdMicros(this.llm.model, result.usage),
      },
    });
  }

  private staffName(staff: User): string {
    return [staff.firstName, staff.lastName].filter(Boolean).join(' ') || staff.email;
  }

  async chat(staff: User, dto: IrisChatDto): Promise<IrisChatResult> {
    const convo = await this.resolveConversation(staff, dto.conversationId, dto.message);
    const history = await this.loadHistory(convo.id);
    const result = await this.orchestrator.runTurn({
      history,
      userMessage: dto.message,
      ctx: { staff, role: staff.role, conversationId: convo.id },
      staffName: this.staffName(staff),
    });
    await this.persistTurn(convo, history, result, staff);
    return { conversationId: convo.id, reply: result.reply, cards: result.cards };
  }

  /** Streaming variant — emits `delta` text events as the model generates, then `done`. */
  async chatStream(staff: User, dto: IrisChatDto, emit: (e: IrisStreamEvent) => void): Promise<void> {
    try {
      const convo = await this.resolveConversation(staff, dto.conversationId, dto.message);
      const history = await this.loadHistory(convo.id);
      const result = await this.orchestrator.runTurn({
        history,
        userMessage: dto.message,
        ctx: { staff, role: staff.role, conversationId: convo.id },
        staffName: this.staffName(staff),
        events: {
          onDelta: (text) => emit({ type: 'delta', text }),
          onThinking: (text) => emit({ type: 'thinking', text }),
          onTool: (name) => emit({ type: 'tool', name }),
        },
      });
      await this.persistTurn(convo, history, result, staff);
      emit({ type: 'done', conversationId: convo.id, reply: result.reply, cards: result.cards });
    } catch (e) {
      emit({ type: 'error', message: (e as Error).message });
    }
  }

  async listConversations(staff: User) {
    return this.prisma.irisConversation.findMany({
      where: { staffId: staff.id },
      orderBy: { updatedAt: 'desc' },
      take: 50,
      select: { id: true, title: true, updatedAt: true },
    });
  }

  async getConversation(staff: User, id: string) {
    const convo = await this.prisma.irisConversation.findFirst({ where: { id, staffId: staff.id } });
    if (!convo) throw new NotFoundException('Conversation not found.');
    const msgs = await this.prisma.irisMessage.findMany({ where: { conversationId: id }, orderBy: { createdAt: 'asc' } });
    const messages = msgs
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({ role: m.role, text: messageText(m) }))
      .filter((m) => m.text.trim().length > 0);
    return { conversationId: id, title: convo.title, messages };
  }
}
