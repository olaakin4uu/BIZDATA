import {
  AnalyticsAgent,
  AgentContext,
  AgentSignal,
  TaxpayerProfile,
  TaxpayerType,
  clamp01,
  severityFor,
} from '../agent.types';

/**
 * Agent 5 — Predictive Compliance. Predicts the likelihood a taxpayer will
 * voluntarily settle a demand notice vs default & require escalation, so
 * officers can prioritise the highest expected net recovery.
 *
 * DATA REALITY: only per-account period AGGREGATES exist (inflow/outflow,
 * opening/closing balance, transactionCount, payload, matchConfidence). There
 * is NO transaction-level detail, no payment history, and no prior-demand
 * outcome. We therefore PROXY two things from what we have:
 *
 *   1. estimatedExposure — the unexplained tax base = totalInflow − declaredIncome
 *      (the discrepancy magnitude). This is the recoverable amount in scope.
 *
 *   2. settlementLikelihood — a 0..1 propensity to pay voluntarily, built from
 *      observable behavioural proxies:
 *        • Liquidity / ability-to-pay   — retained closingBalance vs exposure.
 *        • Footprint / traceability     — more providers + higher matchConfidence
 *                                          => harder to hide, more cooperative.
 *        • Entity type base rate        — corporates/government settle more
 *                                          reliably than individuals (reputational
 *                                          & going-concern pressure).
 *        • Relative discrepancy         — a small gap relative to declared income
 *                                          is more likely an honest error that is
 *                                          settled; an enormous multiple signals
 *                                          deliberate evasion and likely default.
 *
 * The emitted SIGNAL score is NOT the settlement likelihood — it is an
 * expected-net-recovery PRIORITY: officers should chase cases that are large
 * AND likely to pay, but also very large cases even when default is likely
 * (because partial/enforced recovery of a huge exposure still beats settling a
 * trivial one). See computePriorityScore for the exact combination.
 */
export class PredictiveComplianceAgent implements AnalyticsAgent {
  readonly key = 'predictive';
  readonly name = 'Predictive Compliance';

  analyze(profile: TaxpayerProfile, _ctx: AgentContext): AgentSignal | null {
    const exposure = estimatedExposure(profile);

    // Nothing recoverable in scope => nothing for this agent to prioritise.
    // (A non-positive discrepancy means declared income covers observed inflow.)
    if (exposure <= 0) {
      return null;
    }

    const closingBalance = sumClosingBalance(profile);
    const avgMatchConfidence = averageMatchConfidence(profile);

    const liquidity = liquidityScore(closingBalance, exposure);
    const footprint = footprintScore(profile.providerCount, avgMatchConfidence);
    const typeBase = typeSettlementBaseRate(profile.type);
    const relGap = relativeGap(profile.totalInflow, profile.declaredIncome, profile.hasDeclaration);
    const gapDamping = gapSettlementFactor(relGap);

    const settlementLikelihood = computeSettlementLikelihood({
      liquidity,
      footprint,
      typeBase,
      gapDamping,
    });

    // Normalise exposure to a 0..1 "size" weight on a log scale so a single
    // mega-case doesn't saturate everything while still dominating priority.
    const exposureWeight = exposureSizeWeight(exposure);

    const score = computePriorityScore(exposureWeight, settlementLikelihood);
    const severity = severityFor(score);

    const rationale = priorityRationale(exposureWeight, settlementLikelihood);
    const lowConfidence = avgMatchConfidence === null || profile.providerCount === 0;

    const summary = buildSummary({
      type: profile.type,
      exposure,
      settlementLikelihood,
      rationale,
      lowConfidence,
      hasDeclaration: profile.hasDeclaration,
    });

    return {
      agentKey: this.key,
      score,
      severity,
      summary,
      details: {
        estimatedExposure: round2(exposure),
        settlementLikelihood: round2(settlementLikelihood),
        priorityScore: round2(score),
        priorityRationale: rationale,
        components: {
          liquidity: round2(liquidity),
          footprint: round2(footprint),
          typeBaseRate: round2(typeBase),
          gapDamping: round2(gapDamping),
          exposureWeight: round2(exposureWeight),
          relativeGapMultiple: relGap === null ? null : round2(relGap),
        },
        evidence: {
          totalInflow: round2(profile.totalInflow),
          declaredIncome: round2(profile.declaredIncome),
          hasDeclaration: profile.hasDeclaration,
          retainedClosingBalance: round2(closingBalance),
          providerCount: profile.providerCount,
          avgMatchConfidence: avgMatchConfidence === null ? null : round2(avgMatchConfidence),
        },
        limitations:
          'Heuristic from period aggregates only; no payment history, prior-demand ' +
          'outcomes, or transaction-level detail available. Settlement likelihood is a ' +
          'behavioural proxy (liquidity, traceability, entity type, discrepancy size), ' +
          'not a calibrated probability.',
      },
    };
  }
}

// ---------------------------------------------------------------------------
// Reusable pure helpers (exported for testing / reuse by other agents).
// ---------------------------------------------------------------------------

/**
 * Estimated recoverable exposure = unexplained tax base.
 * Discrepancy between observed bank inflow and declared assessable income.
 * If no declaration was filed, the whole observed inflow is unexplained.
 */
export function estimatedExposure(profile: TaxpayerProfile): number {
  const declared = profile.hasDeclaration ? Math.max(0, profile.declaredIncome) : 0;
  return Math.max(0, profile.totalInflow - declared);
}

/** Σ of per-account closing balances (best available retained-liquidity proxy). */
export function sumClosingBalance(profile: TaxpayerProfile): number {
  return profile.records.reduce((acc, r) => acc + (r.closingBalance || 0), 0);
}

/** Mean of available matchConfidence values, or null if none reported. */
export function averageMatchConfidence(profile: TaxpayerProfile): number | null {
  const vals = profile.records
    .map((r) => r.matchConfidence)
    .filter((v): v is number => typeof v === 'number' && !Number.isNaN(v));
  if (vals.length === 0) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

/**
 * Ability-to-pay proxy: how much of the exposure could be covered by retained
 * cash on hand (closing balances). Saturates at 1 (can cover it comfortably).
 */
export function liquidityScore(closingBalance: number, exposure: number): number {
  if (exposure <= 0) return 1;
  if (closingBalance <= 0) return 0;
  return clamp01(closingBalance / exposure);
}

/**
 * Traceability/cooperation proxy: a taxpayer visible across more providers with
 * higher identity-match quality is harder to hide and more likely to engage.
 * Provider breadth saturates around 3 distinct providers.
 */
export function footprintScore(providerCount: number, avgMatchConfidence: number | null): number {
  const breadth = clamp01(providerCount / 3);
  // Default to a neutral 0.5 when match confidence is unknown.
  const confidence = avgMatchConfidence === null ? 0.5 : clamp01(avgMatchConfidence);
  return clamp01(0.5 * breadth + 0.5 * confidence);
}

/** Base voluntary-settlement rate by entity type (reputational/going-concern pressure). */
export function typeSettlementBaseRate(type: TaxpayerType): number {
  switch (type) {
    case 'GOVERNMENT':
      return 0.8;
    case 'CORPORATE':
      return 0.65;
    case 'INDIVIDUAL':
    default:
      return 0.45;
  }
}

/**
 * Relative discrepancy as a multiple of declared income.
 * Returns null when there is no declaration (no meaningful ratio).
 */
export function relativeGap(
  totalInflow: number,
  declaredIncome: number,
  hasDeclaration: boolean,
): number | null {
  if (!hasDeclaration || declaredIncome <= 0) return null;
  return Math.max(0, (totalInflow - declaredIncome) / declaredIncome);
}

/**
 * Damping factor in [0..1]: a small relative gap looks like an honest
 * understatement (likely to settle, ~1); a very large multiple looks like
 * deliberate evasion (likely to default, -> 0). No declaration => no anchor,
 * treated as moderately uncooperative (0.4).
 */
export function gapSettlementFactor(relGap: number | null): number {
  if (relGap === null) return 0.4;
  // 0x gap -> 1.0, ~3x gap -> ~0.5, large -> approaches 0.
  return clamp01(1 / (1 + relGap / 3));
}

/** Weighted blend of the settlement-propensity proxies into a 0..1 likelihood. */
export function computeSettlementLikelihood(p: {
  liquidity: number;
  footprint: number;
  typeBase: number;
  gapDamping: number;
}): number {
  const raw =
    0.3 * p.liquidity + 0.2 * p.footprint + 0.25 * p.typeBase + 0.25 * p.gapDamping;
  return clamp01(raw);
}

/**
 * Map an absolute exposure (currency) to a 0..1 size weight on a log scale.
 * ~1M maps to ~0.5, ~1B saturates near 1. Keeps mega-cases dominant without
 * letting one case swamp the band entirely.
 */
export function exposureSizeWeight(exposure: number): number {
  if (exposure <= 0) return 0;
  // log10(exposure) ranges ~0 (₦1) .. ~9 (₦1B). Normalise over [3..9].
  const lo = 3; // ₦1,000 — below this, negligible priority
  const hi = 9; // ₦1,000,000,000 — saturates
  const l = Math.log10(exposure);
  return clamp01((l - lo) / (hi - lo));
}

/**
 * Expected-net-recovery PRIORITY (the emitted signal score, higher = chase first).
 *
 * Combines exposure size with settlement likelihood:
 *  - The expected-value term (size × likelihood) rewards large recoverable cases
 *    that are also likely to pay.
 *  - A pure-size term ensures very large exposures stay high priority even when
 *    default is likely (enforced/partial recovery of a huge sum still matters).
 */
export function computePriorityScore(exposureWeight: number, settlementLikelihood: number): number {
  const expectedValue = exposureWeight * settlementLikelihood;
  const sizeFloor = 0.6 * exposureWeight; // big cases never drop below this
  return clamp01(Math.max(expectedValue, sizeFloor));
}

/** Short machine-friendly rationale tag for why this case is prioritised (or not). */
export function priorityRationale(exposureWeight: number, settlementLikelihood: number): string {
  const big = exposureWeight >= 0.5;
  const likely = settlementLikelihood >= 0.5;
  if (big && likely) {
    return 'HIGH_PRIORITY: large recoverable exposure and likely to settle voluntarily.';
  }
  if (big && !likely) {
    return 'PURSUE_WITH_ENFORCEMENT: large exposure but low settlement propensity; expect to escalate.';
  }
  if (!big && likely) {
    return 'EASY_WIN: modest exposure but high settlement propensity; low-effort recovery.';
  }
  return 'LOW_PRIORITY: modest exposure and low settlement propensity; poor expected net recovery.';
}

function buildSummary(p: {
  type: TaxpayerType;
  exposure: number;
  settlementLikelihood: number;
  rationale: string;
  lowConfidence: boolean;
  hasDeclaration: boolean;
}): string {
  const pct = Math.round(p.settlementLikelihood * 100);
  const exposureStr = formatCurrency(p.exposure);
  const declarationNote = p.hasDeclaration
    ? ''
    : ' No declaration on file, so full observed inflow is treated as unexplained.';
  const confidenceNote = p.lowConfidence
    ? ' Identity-match confidence/footprint data is thin, so the likelihood estimate is low-confidence.'
    : '';
  return (
    `Estimated recoverable exposure of ${exposureStr} with an estimated ${pct}% ` +
    `voluntary-settlement likelihood for this ${p.type.toLowerCase()} taxpayer. ` +
    `${p.rationale}` +
    declarationNote +
    confidenceNote
  );
}

// --- small formatting/util helpers ---------------------------------------

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function formatCurrency(n: number): string {
  // Deterministic, locale-independent grouping (no Intl dependency on environment).
  const rounded = Math.round(n);
  const s = rounded.toString();
  const withSep = s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `₦${withSep}`;
}
