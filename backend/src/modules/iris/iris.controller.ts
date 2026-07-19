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
 * IRIS chat + the approval gate. Any authenticated staff member may talk to IRIS;
 * what they can DO is gated per-tool by role (the catalog filter), and confirming
 * a draft re-checks role/ownership. Downloads decrypt server-side for the owner.
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
