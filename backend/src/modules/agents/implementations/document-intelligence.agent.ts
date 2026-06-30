import { AnalyticsAgent, AgentContext, AgentSignal, TaxpayerProfile, clamp01, severityFor } from '../agent.types';

/**
 * Agent 6 — Document Intelligence.
 *
 * PURPOSE
 * At objection time a taxpayer uploads supporting documents (bank/financial
 * statements, accounts) to dispute a BRIS assessment. An upstream OCR pass
 * (and/or an LLM extraction step) turns those scanned/PDF documents into raw
 * text. This agent's job is to turn that text into structured figures and to
 * reconcile the taxpayer's *declared* income against the *observed* bank-
 * reported inflow we already hold — flagging material variances for an officer.
 *
 * DATA REALITY (profile time)
 * The data model does NOT yet carry uploaded objection documents on the
 * TaxpayerProfile — there is no field referencing OCR'd text, attachments, or
 * an objection case. There is therefore genuinely nothing to reconcile when the
 * orchestrator runs the agent fleet over a profile, so `analyze()` returns null.
 * (Profile inputs are per-account period AGGREGATES only: inflow/outflow,
 * opening/closing balance, transactionCount, payload, matchConfidence.)
 *
 * WHAT IS IMPLEMENTED
 * The reusable, pure, deterministic helpers the objection workflow calls once a
 * document has been OCR'd are exported below:
 *   - extractFinancials(text)            — heuristic figure extraction from OCR text
 *   - reconcile(extracted, observedInflow) — variance + consistency verdict
 * These are exported so the objection-processing service (and unit tests) can
 * feed OCR/LLM output straight in. They live here, not in analyze(), because the
 * profile-time fleet run has no document context yet.
 */
export class DocumentIntelligenceAgent implements AnalyticsAgent {
  readonly key = 'document';
  readonly name = 'Document Intelligence';

  /**
   * No uploaded objection documents are attached to a TaxpayerProfile in the
   * current data model, so there is nothing to reconcile at profile time.
   * The reconciliation runs later in the objection workflow via the exported
   * extractFinancials/reconcile helpers. Return null (no signal).
   */
  analyze(_profile: TaxpayerProfile, _ctx: AgentContext): AgentSignal | null {
    return null;
  }
}

/** Structured figures pulled out of OCR'd statement text. Any field may be absent. */
export interface ExtractedFinancials {
  declaredIncome?: number;
  expenses?: number;
  assetDisposals?: number;
}

/** Verdict from comparing a declared figure against bank-reported inflow. */
export interface ReconciliationResult {
  /** Signed fraction: (declared - observed) / observed. Negative = under-declared. */
  variance: number;
  /** True when the declared figure is within tolerance of the observed inflow. */
  consistent: boolean;
  /** Officer-facing note explaining the verdict. */
  note: string;
}

/** Declared income within ±15% of observed inflow is treated as consistent. */
const RECONCILE_TOLERANCE = 0.15;

/**
 * Parse a single NGN money token into a number of naira.
 *
 * Handles the formats OCR commonly produces on Nigerian statements:
 *   - thousands separators:        "1,200,000"   -> 1200000
 *   - leading currency symbols:    "N1,200,000", "₦1,200,000", "NGN 1,200,000"
 *   - magnitude suffixes:          "1.2m"/"1.2M" -> 1200000, "950k" -> 950000,
 *                                  "2.5bn"/"2.5b" -> 2500000000
 *   - decimals/kobo:               "1200000.50"  -> 1200000.5
 *
 * Returns null when the token carries no usable digits. Pure/deterministic.
 */
export function parseNgnAmount(raw: string): number | null {
  if (!raw) return null;
  let s = raw.trim().toLowerCase();

  // Strip currency markers: ₦, the leading "n"/"ngn" prefix, and any whitespace.
  s = s.replace(/₦/g, '').replace(/ngn/g, '');
  // A single leading "n" used as the naira symbol (e.g. "n1,200,000").
  s = s.replace(/^\s*n(?=[\d.])/i, '');
  s = s.replace(/\s+/g, '');

  // Detect a magnitude suffix.
  let multiplier = 1;
  const suffixMatch = s.match(/(bn|b|m|k)$/);
  if (suffixMatch) {
    const suffix = suffixMatch[1];
    if (suffix === 'k') multiplier = 1_000;
    else if (suffix === 'm') multiplier = 1_000_000;
    else multiplier = 1_000_000_000; // "b" or "bn"
    s = s.slice(0, s.length - suffix.length);
  }

  // Remove thousands separators; keep the decimal point.
  s = s.replace(/,/g, '');

  if (!/^\d*\.?\d+$/.test(s) && !/^\d+\.?\d*$/.test(s)) return null;
  const value = Number(s);
  if (!Number.isFinite(value)) return null;
  return value * multiplier;
}

/** Pick the first parseable NGN amount appearing after a label regex, if any. */
function firstLabeledAmount(text: string, label: RegExp): number | undefined {
  // Find the label, then scan the remainder of that line for a money token.
  const labelMatch = label.exec(text);
  if (!labelMatch) return undefined;
  const tail = text.slice(labelMatch.index + labelMatch[0].length);
  // Money token: optional currency marker, digits with separators/decimals,
  // optional magnitude suffix. Stop at the first newline so we stay on-line.
  const line = tail.split(/\r?\n/, 1)[0];
  const money = /(?:ngn|₦|n)?\s*\d[\d,]*(?:\.\d+)?\s*(?:bn|b|m|k)?/i.exec(line);
  if (!money) return undefined;
  return parseNgnAmount(money[0]) ?? undefined;
}

/**
 * Heuristically extract declared income, expenses and asset-disposal proceeds
 * from OCR'd statement text. This is intentionally label-driven and tolerant:
 * OCR output is noisy, so we match common synonyms case-insensitively and take
 * the first money token following each label.
 *
 * UPSTREAM: `text` is the output of the OCR/LLM extraction step over an uploaded
 * objection document; this helper does no IO of its own and is deterministic.
 *
 * Recognised labels (synonyms, case-insensitive):
 *   declaredIncome  <- "declared income" | "total income" | "gross income" |
 *                      "turnover" | "revenue" | "assessable income"
 *   expenses        <- "expenses" | "total expenses" | "cost of sales" |
 *                      "operating expenses"
 *   assetDisposals  <- "asset disposal(s)" | "disposal of assets" |
 *                      "proceeds from sale of asset(s)" | "gain on disposal"
 *
 * Returns only the fields it could confidently parse; absent fields are omitted.
 */
export function extractFinancials(text: string): ExtractedFinancials {
  const result: ExtractedFinancials = {};
  if (!text || typeof text !== 'string') return result;

  const declared = firstLabeledAmount(
    text,
    /(?:declared|assessable|gross|total)\s+income|turnover|revenue/i,
  );
  if (declared !== undefined) result.declaredIncome = declared;

  const expenses = firstLabeledAmount(
    text,
    /(?:total\s+|operating\s+)?expenses|cost\s+of\s+sales/i,
  );
  if (expenses !== undefined) result.expenses = expenses;

  const disposals = firstLabeledAmount(
    text,
    /(?:asset\s+disposals?|disposal\s+of\s+assets?|proceeds\s+from\s+sale\s+of\s+assets?|gain\s+on\s+disposal)/i,
  );
  if (disposals !== undefined) result.assetDisposals = disposals;

  return result;
}

/**
 * Reconcile an extracted declared income against the bank-reported inflow we
 * already hold for the taxpayer/year.
 *
 * variance is the signed fraction (declared - observed) / observed:
 *   - variance < 0  => declared LESS than observed (potential under-declaration)
 *   - variance > 0  => declared MORE than observed
 * `consistent` is true when |variance| <= RECONCILE_TOLERANCE (±15%).
 *
 * Edge cases (pure/deterministic):
 *   - missing declaredIncome      => not consistent, variance 0, explanatory note
 *   - observedInflow <= 0         => cannot compute a ratio; note that and return
 *                                    consistent only if declared is also ~0.
 */
export function reconcile(
  extracted: ExtractedFinancials,
  observedInflow: number,
): ReconciliationResult {
  const declared = extracted?.declaredIncome;

  if (declared === undefined) {
    return {
      variance: 0,
      consistent: false,
      note: 'No declared income could be extracted from the document; manual review required.',
    };
  }

  if (!Number.isFinite(observedInflow) || observedInflow <= 0) {
    const consistent = declared <= 0;
    return {
      variance: 0,
      consistent,
      note: consistent
        ? 'No bank-reported inflow on record and no declared income; nothing to reconcile.'
        : `Declared income of NGN ${declared.toLocaleString('en-NG')} but no bank-reported inflow on record; cannot compute variance.`,
    };
  }

  const variance = (declared - observedInflow) / observedInflow;
  const consistent = Math.abs(variance) <= RECONCILE_TOLERANCE;
  const pct = (variance * 100).toFixed(1);
  const direction = variance < 0 ? 'below' : 'above';

  const note = consistent
    ? `Declared income NGN ${declared.toLocaleString('en-NG')} reconciles with bank-reported inflow NGN ${observedInflow.toLocaleString('en-NG')} (${pct}% variance, within ±${RECONCILE_TOLERANCE * 100}% tolerance).`
    : `Declared income NGN ${declared.toLocaleString('en-NG')} is ${Math.abs(Number(pct))}% ${direction} bank-reported inflow NGN ${observedInflow.toLocaleString('en-NG')}; variance exceeds ±${RECONCILE_TOLERANCE * 100}% tolerance.`;

  return { variance, consistent, note };
}

/**
 * Map a reconciliation variance to a 0..1 concern score for downstream use
 * (e.g. when the objection workflow wants to raise its own RiskSignal).
 * Under-declaration is the concern: a declared figure far below observed inflow
 * scores high; over-declaration or a close match scores low. Exported as a pure
 * helper; uses the shared clamp01/severityFor so banding stays consistent.
 */
export function scoreReconciliation(result: ReconciliationResult): {
  score: number;
  severity: ReturnType<typeof severityFor>;
} {
  // Only under-declaration (declared below observed) is concerning.
  const shortfall = result.variance < 0 ? Math.abs(result.variance) : 0;
  // 0% shortfall -> 0; a 100%+ shortfall (declared ~0 vs real inflow) -> 1.
  const score = clamp01(shortfall);
  return { score, severity: severityFor(score) };
}
