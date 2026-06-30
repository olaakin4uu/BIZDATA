import {
  AnalyticsAgent,
  AgentContext,
  AgentSignal,
  TaxpayerProfile,
  TaxpayerType,
  severityFor,
  clamp01,
} from '../agent.types';

/**
 * Agent 3 — Sector Classification.
 *
 * Infers a likely economic sector from the only signals available in the
 * per-account period aggregates — counter-party / account-name keywords,
 * the mix of provider types, and inflow seasonality across periods — then
 * compares observed totalInflow to the cohort benchmark (sector median, with
 * a turnover-band fallback). The signal escalates when observed inflow far
 * exceeds the cohort median while declaredIncome is low, i.e. a likely
 * under-declaration relative to peers in the inferred sector.
 *
 * DATA REALITY: there is NO transaction-level narration, so sector inference
 * is keyword/heuristic-based and intentionally conservative; confidence is
 * surfaced in `details` and the summary flags low-confidence inferences.
 */

/** FCT-relevant sector list the agent can infer. */
export type InferredSector =
  | 'PROFESSIONAL_SERVICES'
  | 'TRADING'
  | 'REAL_ESTATE'
  | 'HOSPITALITY'
  | 'CONSTRUCTION'
  | 'TECH'
  | 'OTHER';

interface SectorScore {
  sector: InferredSector;
  score: number;
}

/** Keyword lexicon per sector. Matched (case-insensitively) against account/business names. */
const SECTOR_KEYWORDS: Record<Exclude<InferredSector, 'OTHER'>, string[]> = {
  PROFESSIONAL_SERVICES: [
    'consult',
    'advisor',
    'advisory',
    'legal',
    'law',
    'chambers',
    'audit',
    'account',
    'tax',
    'engineer',
    'architect',
    'agency',
    'services',
    'solicitor',
    'partners',
    'associates',
  ],
  TRADING: [
    'trading',
    'trade',
    'enterprise',
    'enterprises',
    'ventures',
    'global',
    'import',
    'export',
    'merchant',
    'stores',
    'store',
    'mart',
    'supermarket',
    'distribut',
    'wholesale',
    'retail',
    'commodit',
  ],
  REAL_ESTATE: [
    'real estate',
    'realty',
    'property',
    'properties',
    'estate',
    'homes',
    'housing',
    'land',
    'rent',
    'lease',
    'apartments',
  ],
  HOSPITALITY: [
    'hotel',
    'hotels',
    'suites',
    'resort',
    'restaurant',
    'lounge',
    'bar',
    'catering',
    'hospitality',
    'guest',
    'inn',
    'club',
    'tourism',
    'travels',
    'leisure',
  ],
  CONSTRUCTION: [
    'construction',
    'build',
    'builders',
    'contractor',
    'engineering',
    'civil',
    'works',
    'cement',
    'concrete',
    'infrastructure',
    'developer',
    'developers',
  ],
  TECH: [
    'tech',
    'technolog',
    'software',
    'digital',
    'systems',
    'data',
    'computer',
    'it ',
    'ict',
    'solutions',
    'innovation',
    'labs',
    'cyber',
    'cloud',
    'app',
    'media',
  ],
};

/** Provider-type hints: certain provider kinds nudge the sector inference. */
const PROVIDER_TYPE_HINTS: Array<{ match: RegExp; sector: Exclude<InferredSector, 'OTHER'>; weight: number }> = [
  { match: /mortgage|estate|property/i, sector: 'REAL_ESTATE', weight: 1.5 },
  { match: /merchant|pos|acquir|payment/i, sector: 'TRADING', weight: 1 },
  { match: /fintech|tech|digital/i, sector: 'TECH', weight: 1 },
];

/** Lower-case helper that tolerates null. */
function lc(s: string | null | undefined): string {
  return (s ?? '').toLowerCase();
}

/**
 * Count keyword hits per sector across the taxpayer's business name and every
 * account name on record. Returns a weighted score per sector (0 = no hits).
 */
export function scoreSectorsByKeywords(profile: TaxpayerProfile): Record<InferredSector, number> {
  const scores: Record<InferredSector, number> = {
    PROFESSIONAL_SERVICES: 0,
    TRADING: 0,
    REAL_ESTATE: 0,
    HOSPITALITY: 0,
    CONSTRUCTION: 0,
    TECH: 0,
    OTHER: 0,
  };

  const haystacks: string[] = [];
  haystacks.push(lc(profile.businessName));
  for (const r of profile.records) {
    haystacks.push(lc(r.accountName));
  }

  for (const [sector, keywords] of Object.entries(SECTOR_KEYWORDS) as Array<
    [Exclude<InferredSector, 'OTHER'>, string[]]
  >) {
    for (const hay of haystacks) {
      if (!hay) continue;
      for (const kw of keywords) {
        if (hay.includes(kw)) scores[sector] += 1;
      }
    }
  }

  // Provider-type mix hints.
  for (const r of profile.records) {
    const pt = r.providerType ?? '';
    for (const hint of PROVIDER_TYPE_HINTS) {
      if (hint.match.test(pt)) scores[hint.sector] += hint.weight;
    }
  }

  return scores;
}

/**
 * Coefficient of variation of inflow across distinct periods, used as a crude
 * seasonality proxy. High variability nudges toward seasonal sectors
 * (HOSPITALITY / TRADING / CONSTRUCTION) when keyword evidence is weak.
 * Returns 0 when fewer than 2 periods are available.
 */
export function inflowSeasonality(profile: TaxpayerProfile): number {
  const byPeriod = new Map<string, number>();
  for (const r of profile.records) {
    const k = `${r.periodYear}::${r.periodLabel}`;
    byPeriod.set(k, (byPeriod.get(k) ?? 0) + (r.totalInflow || 0));
  }
  const vals = [...byPeriod.values()];
  if (vals.length < 2) return 0;
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  if (mean <= 0) return 0;
  const variance = vals.reduce((a, b) => a + (b - mean) * (b - mean), 0) / vals.length;
  return Math.sqrt(variance) / mean; // coefficient of variation
}

/**
 * Infer the most likely sector. Returns the chosen sector plus a 0..1
 * confidence and the per-sector keyword scores for transparency.
 */
export function inferSector(profile: TaxpayerProfile): {
  sector: InferredSector;
  confidence: number;
  seasonality: number;
  keywordScores: Record<InferredSector, number>;
} {
  const keywordScores = scoreSectorsByKeywords(profile);
  const seasonality = inflowSeasonality(profile);

  const ranked: SectorScore[] = (Object.entries(keywordScores) as Array<[InferredSector, number]>)
    .filter(([s]) => s !== 'OTHER')
    .map(([sector, score]) => ({ sector, score }))
    .sort((a, b) => b.score - a.score);

  const top = ranked[0];
  const second = ranked[1];

  // No keyword evidence at all → fall back on seasonality, else OTHER.
  if (!top || top.score === 0) {
    if (seasonality >= 0.6) {
      // Highly seasonal cash flow with no naming evidence: best guess TRADING.
      return { sector: 'TRADING', confidence: 0.2, seasonality, keywordScores };
    }
    return { sector: 'OTHER', confidence: 0, seasonality, keywordScores };
  }

  // Confidence grows with hit count and with separation from the runner-up.
  const margin = top.score - (second?.score ?? 0);
  const confidence = clamp01(0.3 + 0.15 * top.score + 0.15 * margin);

  return { sector: top.sector, confidence, seasonality, keywordScores };
}

export class SectorClassificationAgent implements AnalyticsAgent {
  readonly key = 'sector';
  readonly name = 'Sector Classification';

  analyze(profile: TaxpayerProfile, ctx: AgentContext): AgentSignal | null {
    const observedInflow = profile.totalInflow || 0;

    // Nothing to compare against — no inflow means no income outlier story.
    if (observedInflow <= 0) return null;

    const { sector, confidence, seasonality, keywordScores } = inferSector(profile);

    // Resolve the cohort median: prefer the inferred sector, fall back to the
    // taxpayer's turnover band when the sector median is unknown or OTHER.
    const sectorMedian =
      sector === 'OTHER' ? null : ctx.benchmarks.medianForSector(sector);
    let benchmarkBasis: 'SECTOR' | 'BAND' = 'SECTOR';
    let median = sectorMedian;
    if (median === null || !(median > 0)) {
      median = ctx.benchmarks.medianForBand(profile.type as TaxpayerType, observedInflow);
      benchmarkBasis = 'BAND';
    }

    // Without a usable benchmark we cannot judge an outlier.
    if (!(median !== null && median > 0)) return null;

    const ratio = observedInflow / median;

    // Under-declaration gap: how much of the observed inflow is undeclared.
    const declared = Math.max(0, profile.declaredIncome || 0);
    const declarationRatio = declared / observedInflow; // 0..1+ (1 = fully declared)
    const undeclaredFraction = clamp01(1 - declarationRatio);

    // --- Scoring ---------------------------------------------------------
    // Component A: how far observed inflow exceeds the cohort median.
    //   ratio 1x → 0, 3x → ~0.5, 5x+ → ~1.
    const excessComponent = clamp01((ratio - 1) / 4);

    // Component B: under-declaration relative to observed inflow.
    //   No declaration at all is the worst case.
    const declarationComponent = profile.hasDeclaration ? undeclaredFraction : 1;

    // The concern is the JOINT condition: high inflow vs peers AND low declared
    // income. Use a weighted product-like blend so a benign factor dampens the
    // score (a high earner who declares fully is not concerning here).
    const rawScore =
      0.65 * (excessComponent * declarationComponent) +
      0.25 * excessComponent +
      0.1 * declarationComponent;

    // Discount the score by inference confidence and by benchmark quality so a
    // shaky sector guess or a coarse band fallback cannot alone drive HIGH.
    const confidenceFactor =
      benchmarkBasis === 'SECTOR' ? 0.6 + 0.4 * confidence : 0.55 + 0.25 * confidence;

    const score = clamp01(rawScore * confidenceFactor);

    // Suppress genuinely unremarkable cases.
    if (score < 0.1) return null;

    const severity = severityFor(score);

    const sectorLabel = sector.replace(/_/g, ' ').toLowerCase();
    const ratioStr = ratio.toFixed(2);
    const lowConfidence = benchmarkBasis === 'BAND' || confidence < 0.35;

    const summaryParts: string[] = [];
    summaryParts.push(
      `Inferred sector ${sectorLabel} (confidence ${(confidence * 100).toFixed(0)}%).`,
    );
    summaryParts.push(
      `Observed inflow is ${ratioStr}x the ${
        benchmarkBasis === 'SECTOR' ? 'sector' : 'turnover-band'
      } median (${Math.round(observedInflow).toLocaleString()} vs ${Math.round(
        median,
      ).toLocaleString()}).`,
    );
    if (!profile.hasDeclaration) {
      summaryParts.push('No income declaration on file.');
    } else {
      summaryParts.push(
        `Declared income covers only ${(declarationRatio * 100).toFixed(0)}% of observed inflow.`,
      );
    }
    if (lowConfidence) {
      summaryParts.push(
        'Sector inferred from account-name/provider hints only (no transaction-level data); treat the sector benchmark as indicative.',
      );
    }

    const summary = summaryParts.join(' ');

    return {
      agentKey: this.key,
      score,
      severity,
      summary,
      details: {
        inferredSector: sector,
        inferenceConfidence: Number(confidence.toFixed(3)),
        keywordScores,
        seasonality: Number(seasonality.toFixed(3)),
        benchmarkBasis,
        cohortMedian: Math.round(median),
        observedInflow: Math.round(observedInflow),
        inflowToMedianRatio: Number(ratio.toFixed(3)),
        declaredIncome: Math.round(declared),
        declarationRatio: Number(declarationRatio.toFixed(3)),
        undeclaredFraction: Number(undeclaredFraction.toFixed(3)),
        hasDeclaration: profile.hasDeclaration,
        components: {
          excess: Number(excessComponent.toFixed(3)),
          declaration: Number(declarationComponent.toFixed(3)),
          confidenceFactor: Number(confidenceFactor.toFixed(3)),
        },
        dataLimitations:
          'Sector inferred from account/business names + provider-type mix + inflow seasonality; no transaction narration available. Benchmark falls back to turnover band when no sector median exists.',
      },
    };
  }
}
