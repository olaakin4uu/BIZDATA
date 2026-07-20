import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { ConfirmRequired, ToolContext } from '../tools/tool.types';

/**
 * Creates a PENDING IrisDraft and returns the confirm sentinel. Kept tiny and
 * dependency-light (Prisma only) so action tools can use it without pulling in
 * IrisDraftService — which avoids a DI cycle (IrisDraftService depends on the
 * action tools for commit dispatch).
 */
@Injectable()
export class DraftProposer {
  constructor(private prisma: PrismaService) {}

  async propose(
    ctx: ToolContext,
    input: {
      kind: string;
      title: string;
      summary: string;
      payload: Record<string, unknown>;
      details?: { label: string; value: string }[];
      body?: string;
    },
  ): Promise<ConfirmRequired> {
    const draft = await this.prisma.irisDraft.create({
      data: {
        staffId: ctx.staff.id,
        conversationId: ctx.conversationId ?? null,
        kind: input.kind,
        status: 'PENDING',
        summary: input.summary,
        payload: input.payload as Prisma.InputJsonValue,
      },
    });
    return {
      __confirmRequired: true,
      card: {
        draftId: draft.id,
        kind: input.kind,
        title: input.title,
        summary: input.summary,
        details: input.details,
        body: input.body,
      },
    };
  }
}
