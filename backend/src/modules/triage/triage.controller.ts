import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { User } from '@prisma/client';
import { StaffAuthGuard } from '../../common/guards/staff-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentStaff } from '../../common/decorators/current-staff.decorator';
import { TriageService } from './triage.service';

const ACT = ['SUPER_ADMIN', 'ADMIN', 'SUPERVISOR', 'ANALYST'] as const;

@ApiTags('IRIS Case Triage')
@ApiBearerAuth()
@Controller('triage')
@UseGuards(StaffAuthGuard, RolesGuard)
export class TriageController {
  constructor(private service: TriageService) {}

  @Post('run')
  @Roles(...ACT)
  run(@CurrentStaff() u: User, @Body() body: any) {
    return this.service.run(u.id, {
      status: body.status || undefined,
      riskLevel: body.riskLevel || undefined,
      year: body.year ? parseInt(body.year, 10) : undefined,
      assignedToMe: !!body.assignedToMe,
      limit: body.limit ? parseInt(body.limit, 10) : undefined,
      skipTriaged: !!body.skipTriaged,
    });
  }

  @Post('cases/:id/investigate')
  @Roles(...ACT)
  investigate(@CurrentStaff() u: User, @Param('id') id: string) {
    return this.service.investigate(u.id, id);
  }

  @Get('recommendations')
  @Roles(...ACT, 'AUDIT_OFFICER', 'READONLY')
  list(@Query() q: any) {
    return this.service.list({ status: q.status, runId: q.runId, caseId: q.caseId });
  }

  @Post('recommendations/:id/apply')
  @Roles(...ACT)
  apply(@CurrentStaff() u: User, @Param('id') id: string) {
    return this.service.apply({ id: u.id }, id);
  }

  @Post('recommendations/:id/skip')
  @Roles(...ACT)
  skip(@CurrentStaff() u: User, @Param('id') id: string) {
    return this.service.skip({ id: u.id }, id);
  }
}
