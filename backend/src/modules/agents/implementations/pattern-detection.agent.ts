import {
  AnalyticsAgent,
  AgentContext,
  AgentSignal,
  ProfileRecord,
  TaxpayerProfile,
  TaxpayerType,
  clamp01,
  severityFor,
} from '../agent.types';

/**
 * §29 reporting thresholds (NGN) above which a financial institution must file a
 * report. Structuring is the practice of keeping individual flows just BELOW the
 * applicable threshold to avoid triggering that report.
 */
export const SECTION_29_THRESHOLDS: Record<TaxpayerType, number> = {
  INDIVIDUAL: 25_000_000,
  CORPORATE: 100_000_000,
  // Government bodies are not the target of §29 structuring; treat as corporate
  // band so the heuristic still runs without special-casing the caller.
  GOVERNMENT: 100_000_000,
};

/** A value within [floor, threshold) — i.e. clustering just under the line. */
const STRUCTURING_BAND = 0.05; // within ~5% under the threshold
/** Floor below which a flow is too small to be a deliberate "just under" deposit. */
const STRUCTURING_FLOOR = 0.5; // ignore anything below 50% of the threshold

/** Round-number bases (NGN) that cash-intensive deposits tend to land on. */
export const ROUND_BASES = [
  1_000_000, 5_000_000, 10_000_000, 25_000_000, 50_000_000, 100_000_000,
];
/** Relative tolerance for treating a value as an exact multiple of a base. */
const ROUND_TOLERANCE = 0.005; // 0.5%

/**
 * How "just below the threshold" a value is, scored 0..1.
 * 1.0 = sitting right on the threshold from below; 0 = at/over the threshold or
 * below the floor band. Linear within the [floor, threshold) window.
 */
export function structuringProximity(
  value: number,
  threshold: number,
): number {
  if (!(value > 0) || !(threshold > 0)) return 0;
  if (value >= threshold) return 0; // at/over the line is reported, not structured
  const bandStart = threshold * (1 - STRUCTURING_BAND);
  if (value < bandStart) return 0; // not close enough to the line to look deliberate
  // value in [bandStart, threshold) -> map to (0, 1]
  return clamp01((value - bandStart) / (threshold - bandStart));
}

/** True when `value` is a near-exact multiple of `base` (and at least 1x). */
export function isRoundMultiple(value: number, base: number): boolean {
  if (!(value > 0) || !(base > 0) || value < base) return false;
  const ratio = value / base;
  const nearest = Math.round(ratio);
  if (nearest < 1) return false;
  return Math.abs(ratio - nearest) <= ROUND_TOLERANCE;
}

/** Largest round base a value is an exact multiple of, or 0 if none. */
export function roundnessBase(value: number): number {
  let best = 0;
  for (const base of ROUND_BASES) {
    if (isRoundMultiple(value, base) && base > best) best = base;
  }
  return best;
}

interface StructuringHit {
  providerId: string;
  periodLabel: string;
  totalInflow: number;
  proximity: number;
}

interface RoundHit {
  providerId: string;
  periodLabel: string;
  totalInflow: number;
  base: number;
}

/**
 * Agent 1 — Pattern Detection. Detects suspicious credit-transaction patterns
 * from per-account period aggregates (no transaction-level detail is available):
 *
 *  1. Structuring — one or more accounts whose period inflow clusters just below
 *     the §29 reporting threshold for the taxpayer's type (within ~5% under).
 *  2. Round-number deposits — total or per-account inflow landing on suspiciously
 *     round figures (exact multiples of large round bases), a hallmark of
 *     cash-intensive trading where deposits are batched into tidy amounts.
 *
 * Each signal is scored 0..1 and combined. Because only aggregates exist, true
 * transaction-level structuring (many sub-threshold deposits inside one period)
 * cannot be observed directly; the heuristic instead reasons over the per-record
 * array and says so in the summary.
 */
export class PatternDetectionAgent implements AnalyticsAgent {
  readonly key = 'pattern';
  readonly name = 'Pattern Detection';

  analyze(profile: TaxpayerProfile, _ctx: AgentContext): AgentSignal | null {
    const threshold = SECTION_29_THRESHOLDS[profile.type] ?? SECTION_29_THRESHOLDS.CORPORATE;
    const floor = threshold * STRUCTURING_FLOOR;
    const records = profile.records ?? [];

    // --- 1. Structuring: per-record inflow just under the §29 threshold. ---
    const structuringHits: StructuringHit[] = [];
    for (const r of records) {
      const inflow = numeric(r.totalInflow);
      if (inflow < floor) continue;
      const proximity = structuringProximity(inflow, threshold);
      if (proximity > 0) {
        structuringHits.push({
          providerId: r.providerId,
          periodLabel: r.periodLabel,
          totalInflow: inflow,
          proximity,
        });
      }
    }
    // Also test the aggregate total inflow (single account may roll up there).
    const totalProximity = structuringProximity(numeric(profile.totalInflow), threshold);

    // Strength of structuring evidence: the closest hit dominates, and multiple
    // accounts hugging the line (a classic split-across-accounts pattern) add weight.
    const bestRecordProximity = structuringHits.reduce(
      (m, h) => Math.max(m, h.proximity),
      0,
    );
    const peakProximity = Math.max(bestRecordProximity, totalProximity);
    const multiAccountBonus =
      structuringHits.length > 1 ? Math.min(0.2, 0.1 * (structuringHits.length - 1)) : 0;
    const structuringScore = clamp01(peakProximity * 0.85 + multiAccountBonus);

    // --- 2. Round-number deposit patterns. ---
    const roundHits: RoundHit[] = [];
    for (const r of records) {
      const inflow = numeric(r.totalInflow);
      const base = roundnessBase(inflow);
      if (base > 0) {
        roundHits.push({
          providerId: r.providerId,
          periodLabel: r.periodLabel,
          totalInflow: inflow,
          base,
        });
      }
    }
    const totalRoundBase = roundnessBase(numeric(profile.totalInflow));

    // Score round-ness by how large the base is (a multiple of N100m is far more
    // suspicious than of N1m) and how many accounts exhibit the pattern.
    const maxBase = ROUND_BASES[ROUND_BASES.length - 1];
    const recordRoundStrength = roundHits.reduce((m, h) => {
      const sizeWeight = h.base / maxBase; // 0..1 by base magnitude
      // require the amount itself to be material before it counts much
      const materialWeight = clamp01(h.totalInflow / threshold);
      return Math.max(m, 0.3 + 0.7 * sizeWeight * (0.5 + 0.5 * materialWeight));
    }, 0);
    const totalRoundStrength =
      totalRoundBase > 0
        ? 0.3 + 0.7 * (totalRoundBase / maxBase) *
            (0.5 + 0.5 * clamp01(numeric(profile.totalInflow) / threshold))
        : 0;
    const roundCountBonus =
      roundHits.length > 1 ? Math.min(0.15, 0.075 * (roundHits.length - 1)) : 0;
    const roundScore = clamp01(
      Math.max(recordRoundStrength, totalRoundStrength) + roundCountBonus,
    );

    // --- Combine. Structuring is the stronger predicate; round-numbers reinforce. ---
    const score = clamp01(
      Math.max(structuringScore, roundScore) +
        Math.min(structuringScore, roundScore) * 0.25,
    );

    if (score <= 0) return null;

    const severity = severityFor(score);
    const summaryParts: string[] = [];
    if (structuringScore > 0) {
      const n = structuringHits.length || (totalProximity > 0 ? 1 : 0);
      summaryParts.push(
        `${n} account-period inflow${n === 1 ? '' : 's'} cluster just below the ` +
          `§29 reporting threshold of ${formatNgn(threshold)} (within ~5%), ` +
          `consistent with structuring to avoid reporting.`,
      );
    }
    if (roundScore > 0) {
      summaryParts.push(
        `Inflows land on suspiciously round figures (exact multiples of ` +
          `${formatNgn(Math.max(totalRoundBase, ...roundHits.map((h) => h.base), 0))}), ` +
          `a pattern typical of cash-intensive trading.`,
      );
    }
    summaryParts.push(
      'Only per-account period aggregates are available, so individual ' +
        'sub-threshold deposits cannot be observed directly; review underlying ' +
        'statements to confirm.',
    );

    return {
      agentKey: this.key,
      score,
      severity,
      summary: summaryParts.join(' '),
      details: {
        thresholdType: profile.type,
        section29Threshold: threshold,
        structuringScore: round4(structuringScore),
        roundNumberScore: round4(roundScore),
        peakStructuringProximity: round4(peakProximity),
        totalInflow: numeric(profile.totalInflow),
        totalInflowProximity: round4(totalProximity),
        totalInflowRoundBase: totalRoundBase || null,
        structuringHits: structuringHits.map((h) => ({
          providerId: h.providerId,
          periodLabel: h.periodLabel,
          totalInflow: h.totalInflow,
          proximity: round4(h.proximity),
          shortfall: threshold - h.totalInflow,
        })),
        roundNumberHits: roundHits.map((h) => ({
          providerId: h.providerId,
          periodLabel: h.periodLabel,
          totalInflow: h.totalInflow,
          multipleOf: h.base,
        })),
        dataLimitation:
          'Aggregates only — no transaction-level detail; heuristic reasons over ' +
          'per-record period totals.',
      },
    };
  }
}

// --- module-level pure helpers ---

function numeric(n: number): number {
  return Number.isFinite(n) ? n : 0;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function formatNgn(n: number): string {
  if (!(n > 0)) return 'N0';
  return 'N' + Math.round(n).toLocaleString('en-US');
}
