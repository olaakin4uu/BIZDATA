import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { User } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuditService } from '../../../common/services/audit.service';
import { ActionTool, CommitResult } from './action.types';
import { ToolContext } from '../tools/tool.types';
import { RunScanTool } from '../tools/action/run-scan.tool';
import { GenerateReportTool } from '../tools/action/generate-report.tool';
import { DraftNoticeTool } from '../tools/action/draft-notice.tool';

/**
 * Executes (or cancels) an IRIS draft after the officer confirms. Routes by
 * draft.kind to the owning action tool's commit(). Re-enforces role, ownership,
 * and single-use (PENDING only), and audits the decision to the hash chain.
 */
@Injectable()
export class IrisDraftService {
  private readonly committers = new Map<string, ActionTool>();

  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    runScan: RunScanTool,
    generateReport: GenerateReportTool,
    draftNotice: DraftNoticeTool,
  ) {
    for (const t of [runScan, generateReport, draftNotice]) this.committers.set(t.kind, t);
  }

  async confirm(draftId: string, staff: User): Promise<CommitResult & { status: 'confirmed' }> {
    const draft = await this.prisma.irisDraft.findUnique({ where: { id: draftId } });
    if (!draft || draft.staffId !== staff.id) throw new NotFoundException('Draft not found.');
    if (draft.status !== 'PENDING') throw new BadRequestException(`This draft was already ${draft.status.toLowerCase()}.`);

    const tool = this.committers.get(draft.kind);
    if (!tool) throw new BadRequestException(`No handler for draft kind "${draft.kind}".`);
    if (!tool.requiredRoles.includes(staff.role)) {
      throw new ForbiddenException(`Your role (${staff.role}) may not confirm a "${draft.kind}" action.`);
    }

    const ctx: ToolContext = { staff, role: staff.role, conversationId: draft.conversationId ?? undefined };
    const result = await tool.commit(draft.payload as Record<string, unknown>, ctx);

    await this.prisma.irisDraft.update({
      where: { id: draftId },
      data: { status: 'CONFIRMED', decidedAt: new Date(), resultRef: result.resultRef ?? result.download?.exportId ?? null },
    });
    await this.audit.log({
      actorType: 'STAFF', actorId: staff.id, staffId: staff.id,
      action: `IRIS_CONFIRM:${draft.kind}`, entity: 'IrisDraft', entityId: draftId,
      afterJson: { resultRef: result.resultRef ?? null },
    });

    return { status: 'confirmed', ...result };
  }

  async cancel(draftId: string, staff: User): Promise<{ status: 'cancelled' }> {
    const draft = await this.prisma.irisDraft.findUnique({ where: { id: draftId } });
    if (!draft || draft.staffId !== staff.id) throw new NotFoundException('Draft not found.');
    if (draft.status !== 'PENDING') throw new BadRequestException(`This draft was already ${draft.status.toLowerCase()}.`);
    await this.prisma.irisDraft.update({ where: { id: draftId }, data: { status: 'CANCELLED', decidedAt: new Date() } });
    await this.audit.log({
      actorType: 'STAFF', actorId: staff.id, staffId: staff.id,
      action: `IRIS_CANCEL:${draft.kind}`, entity: 'IrisDraft', entityId: draftId,
    });
    return { status: 'cancelled' };
  }
}
