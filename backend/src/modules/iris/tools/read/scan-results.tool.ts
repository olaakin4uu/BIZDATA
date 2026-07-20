import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { AgentTool, ToolContext } from '../tool.types';

const num = (d: Prisma.Decimal | null | undefined): number => (d == null ? 0 : Number(d));

/** READ: list recent underdeclaration scans (or one scan's summary) — totals
 *  scanned/flagged, estimated tax, status, timings. */
@Injectable()
export class ScanResultsTool implements AgentTool {
  readonly name = 'scan_results';
  readonly sensitivity = 'READ' as const;
  readonly requiredRoles = ['SUPER_ADMIN', 'ADMIN', 'SUPERVISOR', 'ANALYST', 'AUDIT_OFFICER', 'DPO', 'READONLY'];
  readonly description =
    'List recent underdeclaration scans or summarise one scan: how many taxpayers were ' +
    'scanned and flagged, total estimated recoverable tax, engine version, status, and timings. ' +
    'Use for "what did the last scan find" or "scans for 2025".';
  readonly inputSchema = {
    type: 'object',
    properties: {
      scanId: { type: 'string', description: 'A specific scan id. Omit to list recent scans.' },
      year: { type: 'integer', description: 'Filter the list by year.' },
    },
  };

  constructor(private prisma: PrismaService) {}

  private shape(s: {
    id: string; year: number; threshold: Prisma.Decimal; totalScanned: number; totalFlagged: number;
    totalEstimatedTax: Prisma.Decimal | null; totalRecovered: Prisma.Decimal | null; engineVersion: string | null;
    status: string; startedAt: Date; completedAt: Date | null;
  }) {
    return {
      scanId: s.id,
      year: s.year,
      thresholdPct: Math.round(num(s.threshold) * 100),
      totalScanned: s.totalScanned,
      totalFlagged: s.totalFlagged,
      totalEstimatedTax: num(s.totalEstimatedTax),
      totalRecovered: num(s.totalRecovered),
      engineVersion: s.engineVersion,
      status: s.status,
      startedAt: s.startedAt,
      completedAt: s.completedAt,
    };
  }

  async execute(args: Record<string, unknown>, _ctx: ToolContext): Promise<unknown> {
    const scanId = typeof args.scanId === 'string' ? args.scanId : '';
    if (scanId) {
      const s = await this.prisma.underdeclarationScan.findUnique({ where: { id: scanId } });
      if (!s) throw new Error(`Scan ${scanId} not found.`);
      return { scan: this.shape(s) };
    }
    const year = typeof args.year === 'number' ? args.year : undefined;
    const scans = await this.prisma.underdeclarationScan.findMany({
      where: year ? { year } : {},
      orderBy: { startedAt: 'desc' },
      take: 15,
    });
    return { count: scans.length, scans: scans.map((s) => this.shape(s)) };
  }
}
