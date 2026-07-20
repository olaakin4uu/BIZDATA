/**
 * Shared contract for the six BRIS analytics agents (§5.2).
 *
 * The orchestrator builds one TaxpayerProfile per taxpayer per year from the
 * available bank-report aggregates, then runs every registered agent over it.
 * Each agent is a PURE function (no DB/IO) so it is independently testable and
 * the implementations can be developed in parallel.
 *
 * Data reality: providers submit per-account period AGGREGATES (inflow/outflow/
 * balances/transaction counts), not transaction-level detail. Agents must work
 * from these aggregates; where an agent would benefit from richer data, it
 * should degrade gracefully and say so in its `summary`/`details`.
 */

export type TaxpayerType = 'INDIVIDUAL' | 'CORPORATE' | 'GOVERNMENT';
export type Severity = 'LOW' | 'MEDIUM' | 'HIGH';

export interface ProfileRecord {
  providerId: string;
  providerType: string;
  periodLabel: string;
  periodYear: number;
  totalInflow: number;
  totalOutflow: number;
  openingBalance: number;
  closingBalance: number;
  transactionCount: number;
  matchConfidence: number | null; // 0..1 identity-match quality
  accountName: string | null;
  payload: Record<string, unknown> | null;
}

export interface TaxpayerProfile {
  taxpayerId: string;
  type: TaxpayerType;
  year: number;
  firstName: string | null;
  lastName: string | null;
  businessName: string | null;
  dateOfBirth: string | null; // ISO date or null
  stateOfResidence: string | null;
  sector: string | null;
  records: ProfileRecord[];
  totalInflow: number;       // Σ record inflow
  totalOutflow: number;      // Σ record outflow
  transactionCount: number;  // Σ record txn counts
  providerCount: number;     // distinct providers
  declaredIncome: number;    // declared assessable income for the year (0 if none)
  hasDeclaration: boolean;
}

/** Peer/cohort medians the Sector agent (and others) can compare against. */
export interface BenchmarkContext {
  /** Median observed inflow for the taxpayer's type + turnover band. */
  medianForBand(type: TaxpayerType, observedInflow: number): number;
  /** Median observed inflow for a named sector, if known. */
  medianForSector(sector: string): number | null;
}

export interface AgentContext {
  benchmarks: BenchmarkContext;
  /**
   * NTAA 2025 §29 reporting thresholds (NGN) by taxpayer type, from the active
   * StatutoryConfig (authoritative gazette: ₦50m individual / ₦250m corporate).
   * Used by structuring detection so the "just under the line" heuristic tracks
   * the real statutory thresholds instead of a hardcoded copy.
   */
  section29Thresholds: Record<TaxpayerType, number>;
}

export interface AgentSignal {
  agentKey: string;
  score: number;       // 0..1, higher = more concerning
  severity: Severity;
  summary: string;     // human-readable, officer-facing
  details?: Record<string, unknown>;
}

export interface AnalyticsAgent {
  /** Stable key persisted on RiskSignal.agentKey. */
  readonly key: string;
  /** Human-facing name. */
  readonly name: string;
  /** Analyse one taxpayer profile; return a signal or null if nothing notable. */
  analyze(profile: TaxpayerProfile, ctx: AgentContext): AgentSignal | null;
}

/** Helper: clamp a raw 0..1 score and map to a severity band. */
export function severityFor(score: number): Severity {
  if (score >= 0.66) return 'HIGH';
  if (score >= 0.33) return 'MEDIUM';
  return 'LOW';
}

export function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}
