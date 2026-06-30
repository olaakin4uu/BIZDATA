import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Model governance metrics. (Stub — implemented by the feature-fleet workflow.)
 * model(year) should derive precision/recall proxies from case outcomes
 * (CONFIRMED/RECOVERED/SETTLED = true positives; DISMISSED = false positives;
 * still-open = pending), plus a fairness view: distribution of flags by
 * taxpayer type and state of residence to surface disparate impact.
 */
@Injectable()
export class MetricsService {
  constructor(private prisma: PrismaService) {}

  async model(year: number): Promise<any> {
    // Pull all cases for the year; we need both outcome counts (precision proxy)
    // and the taxpayer join for the fairness view.
    const cases = await this.prisma.underdeclarationCase.findMany({
      where: { year },
      select: {
        status: true,
        taxpayer: {
          select: { type: true, stateOfResidence: true },
        },
      },
    });

    let open = 0;
    let confirmed = 0;
    let settled = 0;
    let recovered = 0;
    let dismissed = 0;

    const byTypeMap = new Map<string, number>();
    const byStateMap = new Map<string, number>();

    for (const c of cases) {
      switch (c.status) {
        case 'OPEN':
          open += 1;
          break;
        case 'CONFIRMED':
          confirmed += 1;
          break;
        case 'SETTLED':
          settled += 1;
          break;
        case 'RECOVERED':
          recovered += 1;
          break;
        case 'DISMISSED':
          dismissed += 1;
          break;
        default:
          break;
      }

      // Fairness view: every flagged case contributes to the distributions.
      const t = c.taxpayer?.type ?? 'UNKNOWN';
      byTypeMap.set(t, (byTypeMap.get(t) ?? 0) + 1);

      const s = c.taxpayer?.stateOfResidence ?? 'UNKNOWN';
      byStateMap.set(s, (byStateMap.get(s) ?? 0) + 1);
    }

    const total = cases.length;

    // Precision proxy among RESOLVED cases:
    // true positives (CONFIRMED+SETTLED+RECOVERED) over all resolved
    // (true positives + DISMISSED as false positives).
    const truePositives = confirmed + settled + recovered;
    const resolved = truePositives + dismissed;
    const precision = resolved > 0 ? truePositives / resolved : null;

    const byType = Array.from(byTypeMap.entries())
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type));

    const byState = Array.from(byStateMap.entries())
      .map(([state, count]) => ({ state, count }))
      .sort((a, b) => b.count - a.count || a.state.localeCompare(b.state));

    return {
      year,
      precision,
      resolved,
      counts: { open, confirmed, settled, recovered, dismissed, total },
      byType,
      byState,
      limitations:
        'Precision here is a proxy based on case dispositions (CONFIRMED/SETTLED/RECOVERED treated as true positives, DISMISSED as false positives). True recall cannot be computed without ground-truth audit outcomes for the full taxpayer population, including cases that were never flagged.',
    };
  }
}
