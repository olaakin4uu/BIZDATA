import { Injectable } from '@nestjs/common';
import { BenchmarkContext, TaxpayerProfile, TaxpayerType } from './agent.types';

/**
 * Computes peer/cohort medians used by the Sector agent (and others) to judge
 * whether an observed inflow is anomalous for the taxpayer's cohort. Medians are
 * derived from the same set of profiles being analysed (FCT population proxy).
 * Shared dependency — see [[agent.types]] BenchmarkContext.
 */
@Injectable()
export class BenchmarkingService {
  // Turnover bands (annual observed inflow, NGN).
  private band(inflow: number): string {
    if (inflow < 5_000_000) return '<5m';
    if (inflow < 50_000_000) return '5-50m';
    if (inflow < 200_000_000) return '50-200m';
    return '200m+';
  }

  private median(values: number[]): number {
    if (values.length === 0) return 0;
    const s = [...values].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  }

  build(profiles: TaxpayerProfile[]): BenchmarkContext {
    const byBand = new Map<string, number[]>();
    const bySector = new Map<string, number[]>();
    for (const p of profiles) {
      const bandKey = `${p.type}:${this.band(p.totalInflow)}`;
      (byBand.get(bandKey) ?? byBand.set(bandKey, []).get(bandKey)!).push(p.totalInflow);
      if (p.sector) {
        (bySector.get(p.sector) ?? bySector.set(p.sector, []).get(p.sector)!).push(p.totalInflow);
      }
    }
    const bandMedians = new Map<string, number>();
    for (const [k, v] of byBand) bandMedians.set(k, this.median(v));
    const sectorMedians = new Map<string, number>();
    for (const [k, v] of bySector) sectorMedians.set(k, this.median(v));

    return {
      medianForBand: (type: TaxpayerType, observedInflow: number) =>
        bandMedians.get(`${type}:${this.band(observedInflow)}`) ?? 0,
      medianForSector: (sector: string) => sectorMedians.get(sector) ?? null,
    };
  }
}
