import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { TaxNetService, type NetStatus } from './tax-net.service';
import { StaffAuthGuard } from '../../common/guards/staff-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentStaff } from '../../common/decorators/current-staff.decorator';

@ApiTags('Tax Net')
@ApiBearerAuth()
@UseGuards(StaffAuthGuard, RolesGuard)
@Controller('tax-net')
export class TaxNetController {
  constructor(private service: TaxNetService) {}

  @Get('report')
  @ApiOperation({ summary: 'Tax-net comparative — Captured / Unverified / Invisible, ranked by observed inflow' })
  report(@Query() q: any) {
    return this.service.report({
      status: q.status as NetStatus | undefined,
      type: q.type,
      year: q.year ? parseInt(q.year, 10) : undefined,
      page: q.page ? parseInt(q.page, 10) : undefined,
      limit: q.limit ? parseInt(q.limit, 10) : undefined,
    });
  }

  @Post('register/:id')
  @Roles('SUPER_ADMIN', 'ADMIN', 'SUPERVISOR', 'ANALYST')
  @ApiOperation({ summary: 'Manually register one taxpayer into the net (assign/confirm a TIN)' })
  register(@Param('id') id: string, @Body() body: { tin?: string }, @CurrentStaff() u: any) {
    return this.service.register(id, u.id, { tin: body?.tin });
  }

  @Post('auto-register')
  @Roles('SUPER_ADMIN', 'ADMIN', 'SUPERVISOR')
  @ApiOperation({ summary: 'Auto/bulk register registerable taxpayers (optionally scoped or inflow-gated)' })
  autoRegister(
    @Body() body: { ids?: string[]; minInflow?: number; limit?: number },
    @CurrentStaff() u: any,
  ) {
    return this.service.autoRegister(u.id, {
      ids: body?.ids,
      minInflow: body?.minInflow,
      limit: body?.limit,
    });
  }
}
