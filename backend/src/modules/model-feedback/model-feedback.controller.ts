import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { ModelFeedbackService } from './model-feedback.service';
import { StaffAuthGuard } from '../../common/guards/staff-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentStaff } from '../../common/decorators/current-staff.decorator';

@ApiTags('Model Feedback')
@ApiBearerAuth()
@UseGuards(StaffAuthGuard, RolesGuard)
@Controller('model-feedback')
export class ModelFeedbackController {
  constructor(private service: ModelFeedbackService) {}

  @Get()
  @ApiOperation({ summary: 'Per-sector precision from analyst decisions + threshold recommendations' })
  feedback(@Query('year') year?: string) {
    return this.service.feedback(parseInt(year ?? `${new Date().getFullYear()}`, 10));
  }

  @Get('fairness')
  @ApiOperation({ summary: 'Fairness check for a proposed per-sector threshold' })
  fairness(@Query('sector') sector: string, @Query('threshold') threshold: string, @Query('year') year?: string) {
    return this.service.fairnessCheck(sector, parseFloat(threshold), parseInt(year ?? `${new Date().getFullYear()}`, 10));
  }

  @Get('overrides')
  overrides() {
    return this.service.listOverrides();
  }

  @Post('overrides')
  @Roles('SUPER_ADMIN', 'ADMIN', 'SUPERVISOR')
  @ApiOperation({ summary: 'Apply a per-sector threshold (fairness gate must pass unless forced)' })
  apply(@Body() body: { sector: string; threshold: number; year?: number; force?: boolean }, @CurrentStaff() u: any) {
    return this.service.applyOverride(body.sector, body.threshold, body.year ?? new Date().getFullYear(), u.id, body.force);
  }

  @Delete('overrides/:sector')
  @Roles('SUPER_ADMIN', 'ADMIN', 'SUPERVISOR')
  remove(@Param('sector') sector: string, @CurrentStaff() u: any) {
    return this.service.removeOverride(sector, u.id);
  }
}
