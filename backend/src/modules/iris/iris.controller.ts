import { Body, Controller, Get, Param, Post, Res, StreamableFile, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import type { User } from '@prisma/client';
import { StaffAuthGuard } from '../../common/guards/staff-auth.guard';
import { CurrentStaff } from '../../common/decorators/current-staff.decorator';
import { IrisService } from './iris.service';
import { IrisChatDto } from './dto/iris-chat.dto';
import { IrisDraftService } from './approval/iris-draft.service';
import { ExportService } from './export/export.service';

/**
 * IRIS chat (blocking + streaming) + the approval gate + conversation history.
 * Any authenticated staff may talk to IRIS; per-tool role gating and draft
 * confirmation enforce what they can DO. Downloads decrypt server-side for the owner.
 */
@ApiTags('iris')
@ApiBearerAuth()
@Controller('iris')
@UseGuards(StaffAuthGuard)
export class IrisController {
  constructor(
    private iris: IrisService,
    private drafts: IrisDraftService,
    private exports: ExportService,
  ) {}

  @Post('chat')
  @ApiOperation({ summary: 'Send a message to IRIS and get a reply (+ any confirm cards)' })
  chat(@CurrentStaff() staff: User, @Body() dto: IrisChatDto) {
    return this.iris.chat(staff, dto);
  }

  @Post('chat/stream')
  @ApiOperation({ summary: 'Send a message to IRIS and stream the reply (SSE): delta / done / error' })
  async chatStream(@CurrentStaff() staff: User, @Body() dto: IrisChatDto, @Res() res: Response): Promise<void> {
    res.set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // don't let nginx buffer the SSE stream
    });
    res.flushHeaders?.();
    await this.iris.chatStream(staff, dto, (e) => res.write(`data: ${JSON.stringify(e)}\n\n`));
    res.end();
  }

  @Get('conversations')
  @ApiOperation({ summary: "List the officer's IRIS conversations" })
  listConversations(@CurrentStaff() staff: User) {
    return this.iris.listConversations(staff);
  }

  @Get('conversations/:id')
  @ApiOperation({ summary: 'Load one conversation (human-readable messages)' })
  getConversation(@CurrentStaff() staff: User, @Param('id') id: string) {
    return this.iris.getConversation(staff, id);
  }

  @Post('drafts/:id/confirm')
  @ApiOperation({ summary: 'Confirm a proposed action — IRIS carries it out' })
  confirm(@CurrentStaff() staff: User, @Param('id') id: string) {
    return this.drafts.confirm(id, staff);
  }

  @Post('drafts/:id/cancel')
  @ApiOperation({ summary: 'Cancel a proposed action' })
  cancel(@CurrentStaff() staff: User, @Param('id') id: string) {
    return this.drafts.cancel(id, staff);
  }

  @Get('exports/:id/download')
  @ApiOperation({ summary: 'Download an encrypted IRIS export (decrypted server-side for the owner)' })
  async download(
    @CurrentStaff() staff: User,
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const file = await this.exports.download(id, staff);
    res.set({
      'Content-Type': file.mimeType,
      'Content-Disposition': `attachment; filename="${file.fileName}"`,
    });
    return new StreamableFile(file.buffer);
  }
}
