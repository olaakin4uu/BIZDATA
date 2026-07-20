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
 *
 * STATE-vs-FEDERAL SCOPE (v2.1)
 * -----------------------------
 * This engine serves a STATE Internal Revenue Service. Companies Income Tax
 * (CIT) and VAT are FEDERAL taxes (FIRS) — a State IRS has no power to assess
 * them. Asserting a naira income-tax figure against a limited-liability company
 * would be ultra vires and indefensible on appeal. We therefore DO NOT estimate
 * income tax for limited-liability companies (names ending LTD / Limited / PLC);
 * they are routed to the PAYE / CGT / WHT remittance-verification track instead
 * (see Tax Net), because those ARE state-collected. All other parties
 * (individuals and unincorporated/enterprise "corporates") are assessed on the
 * graduated Nigeria Tax Act bands, additionally compared against a configurable
 * flat rate (seeded from the CIT rate) the service may adjust over time.
 */

export const ENGINE_VERSION = 'v2.1';

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

/**
 * Is this business name a limited-liability company? A State IRS does not assess
 * income tax on these (CIT is federal). Matches a trailing LTD / LIMITED / PLC
 * legal-form suffix (with or without a full stop), case-insensitively:
 *   "Acme Ltd", "Acme Ltd.", "ACME LIMITED", "Acme (Nigeria) PLC".
 * `\b` word boundaries avoid false hits inside words (e.g. "Unlimited",
 * "Limitless", the abbreviation in "Split Ltd Partners" is still caught — a
 * conservative, over-inclusive choice that a staff override can correct).
 */
export function isLlcName(name: string | null | undefined): boolean {
  if (!name) return false;
  return /\b(ltd|limited|plc)\b\.?/i.test(name);
}

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

/** How a case's recoverable-tax figure was derived — stored for defensibility. */
export type TaxBasis =
  | 'PIT_GRADUATED' // graduated Nigeria Tax Act bands (individuals / unincorporated)
  | 'NOT_ASSESSED_LLC'; // limited company — income tax is federal, not state-assessed

export interface TaxEstimate {
  /** Whether the STATE assessed income tax at all (false for LLCs). */
  assessed: boolean;
  /** Additional income tax recoverable on the gap (0 when not assessed). */
  tax: number;
  /** Which methodology produced `tax`. */
  basis: TaxBasis;
  /**
   * Comparison figure: the gap taxed at a single configurable flat rate (seeded
   * from the CIT rate). Presented alongside the graduated figure so an officer
   * can sense-check the marginal computation. null when not assessed.
   */
  flatRate: number | null;
  flatTax: number | null;
}

/**
 * Estimate the ADDITIONAL income tax recoverable on undeclared income.
 *
 * Limited-liability companies (LTD/Limited/PLC) are NOT income-assessed by a
 * State IRS — CIT is federal. They return `{ assessed: false }` and are handled
 * on the PAYE/remittance track instead.
 *
 * Everyone else is assessed on the graduated Nigeria Tax Act bands
 * (marginal: PIT(observed) − PIT(declared)), and the same gap is ALSO taxed at
 * a single configurable flat rate for side-by-side comparison.
 */
export function estimateAdditionalTax(opts: {
  taxpayerType: 'INDIVIDUAL' | 'CORPORATE' | 'GOVERNMENT';
  declaredIncome: number;
  observedIncome: number;
  /** True when the taxpayer is a limited company (name suffix or staff override). */
  isLimitedLiability?: boolean;
  /** Configurable flat comparison rate, seeded from CIT (default 0.30). */
  flatRate?: number;
}): TaxEstimate {
  const { taxpayerType, declaredIncome, observedIncome, isLimitedLiability } = opts;
  const rate = opts.flatRate ?? CIT_RATE;

  // Limited companies: income tax is a FEDERAL (FIRS) matter — do not assess.
  if (isLimitedLiability) {
    return { assessed: false, tax: 0, basis: 'NOT_ASSESSED_LLC', flatRate: null, flatTax: null };
  }

  const gap = Math.max(0, observedIncome - declaredIncome);
  if (gap <= 0) {
    return { assessed: true, tax: 0, basis: 'PIT_GRADUATED', flatRate: rate, flatTax: 0 };
  }

  // Graduated Nigeria Tax Act bands — marginal additional tax on the gap.
  // NOTE: `taxpayerType` no longer branches to CIT here; a "CORPORATE" that is
  // NOT a limited company (an enterprise / business name) is assessable by the
  // state and is treated on the graduated bands like an individual.
  const tax = Math.max(0, progressivePit(observedIncome) - progressivePit(declaredIncome));
  const flatTax = gap * rate;
  return { assessed: true, tax, basis: 'PIT_GRADUATED', flatRate: rate, flatTax };
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
