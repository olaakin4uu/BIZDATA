/**
 * BizData Detection Engine — underdeclaration scoring methodology.
 *
 * Why this exists
 * ---------------
 * A flag raised under NTAA 2025 §29 must be *defensible*: an officer (and, on
 * appeal, a tribunal) needs to see WHY a taxpayer was flagged and HOW the
 * recoverable amount was derived. This module isolates that methodology into
 * pure, documented, versioned functions so the logic is auditable and testable
 * independently of the database.
 *
 * Key principles
 * --------------
 * 1. Gross inflow is NOT income. Bank/fintech inflows include transfers between
 *    a person's own accounts, loans, repayments, reversals and pass-through
 *    float. We therefore NORMALIZE inflow downward (conservatively) before
 *    comparing to declared income, to suppress false positives.
 * 2. Every flag carries a CONFIDENCE score and human-readable REASON CODES.
 * 3. The recoverable amount is an estimate of *additional tax* on the gap,
 *    computed on the marginal bands — not a naive % of the discrepancy.
 *
 * The tax bands below reflect the Nigeria Tax Act 2025 schedule but are
 * declared as constants so the revenue authority can confirm/override them.
 * They MUST be validated against the prevailing law before production use.
 */

export const ENGINE_VERSION = 'v2.0';

// ─── Tax parameters (CONFIRM against prevailing Nigeria Tax Act) ─────────────

export interface TaxBand {
  /** Upper bound of this band (annual, NGN). null = no upper bound. */
  upTo: number | null;
  rate: number;
}

/** Personal Income Tax — annual graduated bands (Nigeria Tax Act 2025). */
export const PIT_BANDS: TaxBand[] = [
  { upTo: 800_000, rate: 0 }, // tax-free threshold
  { upTo: 3_000_000, rate: 0.15 },
  { upTo: 12_000_000, rate: 0.18 },
  { upTo: 25_000_000, rate: 0.21 },
  { upTo: 50_000_000, rate: 0.23 },
  { upTo: null, rate: 0.25 },
];

/** Companies Income Tax — small companies (turnover ≤ threshold) are exempt. */
export const CIT_SMALL_CO_THRESHOLD = 50_000_000;
export const CIT_RATE = 0.3;

/** Progressive PIT on a given annual income. */
export function progressivePit(income: number, bands: TaxBand[] = PIT_BANDS): number {
  if (income <= 0) return 0;
  let tax = 0;
  let lower = 0;
  for (const band of bands) {
    const upper = band.upTo ?? Infinity;
    if (income <= lower) break;
    const slice = Math.min(income, upper) - lower;
    tax += slice * band.rate;
    lower = upper;
  }
  return tax;
}

/**
 * Estimate the ADDITIONAL tax recoverable on undeclared income.
 * For individuals this is marginal: PIT(observed) − PIT(declared).
 * For companies it is CIT on the undeclared turnover slice (small-co exempt).
 */
export function estimateAdditionalTax(opts: {
  taxpayerType: 'INDIVIDUAL' | 'CORPORATE' | 'GOVERNMENT';
  declaredIncome: number;
  observedIncome: number;
}): number {
  const { taxpayerType, declaredIncome, observedIncome } = opts;
  if (observedIncome <= declaredIncome) return 0;

  if (taxpayerType === 'CORPORATE') {
    if (observedIncome <= CIT_SMALL_CO_THRESHOLD) return 0;
    return (observedIncome - declaredIncome) * CIT_RATE;
  }
  // INDIVIDUAL / GOVERNMENT → progressive PIT, marginal additional tax
  return Math.max(0, progressivePit(observedIncome) - progressivePit(declaredIncome));
}

// ─── Inflow normalization ─────────────────────────────────────────────────

/**
 * Normalize gross inflow into an income proxy.
 *
 * We only receive monthly per-account aggregates (no transaction-level detail),
 * so we cannot perfectly strip inter-account transfers. Instead we apply a
 * conservative PASS-THROUGH DISCOUNT: when outflow is close to (or exceeds)
 * inflow, the account is likely being used as a conduit (transfers / float /
 * business pass-through) rather than accruing income. The discount ramps from
 * 0 (ratio ≤ 0.85) to a max of 0.5 (ratio ≥ 1.10). Discounting is conservative
 * — it can only *reduce* an apparent discrepancy, never inflate one.
 */
export function normalizeInflow(
  grossInflow: number,
  grossOutflow: number,
): { observedIncome: number; passThroughDiscount: number } {
  if (grossInflow <= 0) return { observedIncome: 0, passThroughDiscount: 0 };
  const ratio = grossOutflow / grossInflow;
  const discount = Math.max(0, Math.min(0.5, ((ratio - 0.85) / 0.25) * 0.5));
  return { observedIncome: grossInflow * (1 - discount), passThroughDiscount: discount };
}

// ─── Confidence scoring + reason codes ──────────────────────────────────────

export interface CaseSignals {
  /** (observed − declared) / declared, or 1 when nothing was declared. */
  discrepancyPct: number;
  /** Number of distinct providers reporting flows for this taxpayer/year. */
  providerCount: number;
  /** Mean identity-match confidence across the taxpayer's records (0..1). */
  avgMatchConfidence: number;
  /** Pass-through discount that was applied (0..0.5). */
  passThroughDiscount: number;
  /** Whether the taxpayer declared any income for the year. */
  hasDeclaration: boolean;
}

export interface ReasonCode {
  code: string;
  label: string;
  weight: number;
}

/**
 * Score a candidate case 0..1 and emit the reason codes that produced it.
 * Magnitude and corroboration push confidence up; weak identity matching and
 * pass-through patterns pull it down.
 */
export function scoreCase(s: CaseSignals): { confidence: number; reasons: ReasonCode[] } {
  const reasons: ReasonCode[] = [];
  let score = 0;
  const add = (code: string, label: string, weight: number) => {
    reasons.push({ code, label, weight });
    score += weight;
  };

  // Magnitude of the gap
  if (s.discrepancyPct >= 2) add('LARGE_GAP', 'Observed income ≥3× declared', 0.35);
  else if (s.discrepancyPct >= 1) add('MODERATE_GAP', 'Observed income ≥2× declared', 0.25);
  else if (s.discrepancyPct >= 0.5) add('SMALL_GAP', 'Observed exceeds declared by ≥50%', 0.15);

  // Cross-provider corroboration
  if (s.providerCount >= 3) add('MULTI_PROVIDER', `${s.providerCount} independent providers corroborate`, 0.25);
  else if (s.providerCount === 2) add('TWO_PROVIDER', '2 providers corroborate', 0.15);

  // Identity-match quality
  if (s.avgMatchConfidence >= 0.9) add('STRONG_ID', 'High-confidence taxpayer identity match', 0.2);
  else if (s.avgMatchConfidence < 0.6) add('WEAK_ID', 'Identity matched on name only — verify', -0.15);

  // No declaration at all is itself a strong signal
  if (!s.hasDeclaration) add('NO_DECLARATION', 'No income declared for the year', 0.2);

  // Dampener: heavy pass-through suggests transfers/float, not income
  if (s.passThroughDiscount >= 0.3) add('PASS_THROUGH', 'High outflow ratio — possible transfers/float', -0.1);

  return { confidence: Math.max(0, Math.min(1, score)), reasons };
}

/** Map a confidence score to a case risk level. */
export function confidenceToRisk(confidence: number): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
  if (confidence >= 0.8) return 'CRITICAL';
  if (confidence >= 0.6) return 'HIGH';
  if (confidence >= 0.4) return 'MEDIUM';
  return 'LOW';
}

// ─── Multi-signal fusion (detection engine ⊕ AI agents) ──────────────────────

/**
 * Aggregate a taxpayer's AI-agent signals into a single 0..1 corroboration
 * score. The strongest signal dominates, and independent agents that also
 * flag (score ≥ 0.4) add a corroboration bonus — multiple lenses agreeing is
 * more convincing than one loud signal.
 */
export function aggregateAgentScore(signals: { score: number }[]): number {
  if (!signals.length) return 0;
  const scores = signals.map((s) => s.score).sort((a, b) => b - a);
  const corroborating = scores.filter((s) => s >= 0.4).length;
  const bonus = 0.08 * Math.max(0, corroborating - 1);
  return Math.max(0, Math.min(1, scores[0] + bonus));
}

/**
 * Fuse the detection-engine confidence with the AI-agent corroboration into a
 * composite case confidence. Detection (statutory inflow-vs-declared) is the
 * primary signal; the agents refine it (weight 0.6 / 0.4).
 */
export function compositeConfidence(detectionConfidence: number, agentScore: number): number {
  return Math.max(0, Math.min(1, 0.6 * detectionConfidence + 0.4 * agentScore));
}
