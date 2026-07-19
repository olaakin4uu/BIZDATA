import { Injectable } from '@nestjs/common';
import type { User, Prisma } from '@prisma/client';
import type Anthropic from '@anthropic-ai/sdk';
import { PrismaService } from '../../prisma/prisma.service';
import { IrisOrchestrator } from './orchestrator/iris.orchestrator';
import { LlmFactory } from './llm/llm.factory';
import { costUsdMicros } from './llm/cost';
import { IrisChatDto } from './dto/iris-chat.dto';

export interface IrisChatResult {
  conversationId: string;
  reply: string;
  cards: unknown[]; // confirm cards for the UI (approval gate)
}

/**
 * Facade for a chat turn: resolves the conversation, replays stored history,
 * runs the orchestrator, persists the new messages, and records COGS.
 */
@Injectable()
export class IrisService {
  constructor(
    private prisma: PrismaService,
    private orchestrator: IrisOrchestrator,
    private llm: LlmFactory,
  ) {}

  async chat(staff: User, dto: IrisChatDto): Promise<IrisChatResult> {
    // Resolve (and own) the conversation.
    let convo = dto.conversationId
      ? await this.prisma.irisConversation.findFirst({ where: { id: dto.conversationId, staffId: staff.id } })
      : null;
    if (!convo) {
      convo = await this.prisma.irisConversation.create({
        data: { staffId: staff.id, title: dto.message.slice(0, 60) },
      });
    }

    // Replay stored blocks as Anthropic message params.
    const prior = await this.prisma.irisMessage.findMany({
      where: { conversationId: convo.id },
      orderBy: { createdAt: 'asc' },
    });
    const history: Anthropic.MessageParam[] = prior
      .filter((m) => m.blocks != null)
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.blocks as unknown as Anthropic.ContentBlockParam[] }));

    const staffName = [staff.firstName, staff.lastName].filter(Boolean).join(' ') || staff.email;
    const result = await this.orchestrator.runTurn({
      history,
      userMessage: dto.message,
      ctx: { staff, role: staff.role, conversationId: convo.id },
      staffName,
    });

    // Persist only this turn's new message params (user + assistant [+ tool result turns]).
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

    // Record COGS (the margin/control layer).
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

    return { conversationId: convo.id, reply: result.reply, cards: result.cards };
  }
}
