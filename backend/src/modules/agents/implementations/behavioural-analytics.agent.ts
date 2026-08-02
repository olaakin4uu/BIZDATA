import {
  AnalyticsAgent,
  AgentContext,
  AgentSignal,
  TaxpayerProfile,
  ProfileRecord,
  severityFor,
  clamp01,
} from '../agent.types';

/**
 * Agent 4 — Behavioural Analytics.
 *
 * Builds a behavioural "fingerprint" for a taxpayer from period-over-period
 * aggregates and flags deviations that correlate with emerging undisclosed
 * income. Because providers submit only per-account period AGGREGATES (inflow,
 * outflow, opening/closing balance, transaction count) — and NOT
 * transaction-level detail — this agent works exclusively on what those
 * aggregates can reveal:
 *
 *   1. Inflow volatility / coefficient of variation across periods.
 *   2. Average transaction size (totalInflow / transactionCount).
 *   3. Provider / counter-party diversity (distinct providers).
 *   4. Balance retention (closing vs opening across the year).
 *   5. Inflow TREND — a sustained rising slope, especially paired with low
 *      declared income, is a classic undisclosed-income tell.
 *   6. Sudden new high-value provider — a provider that appears only in later
 *      periods and immediately accounts for a large share of inflow.
 *
 * NOTE (documented degradation): day-of-week and time-of-day behavioural
 * fingerprints — normally powerful for structuring/laundering detection — are
 * UNAVAILABLE at the aggregate level. This agent therefore reasons about
 * period-level shape only and says so in its summary/details.
 */
export class BehaviouralAnalyticsAgent implements AnalyticsAgent {
  readonly key = 'behavioural';
  readonly name = 'Behavioural Analytics';

  analyze(profile: TaxpayerProfile, _ctx: AgentContext): AgentSignal | null {
    const fp = buildFingerprint(profile);

    // Nothing meaningful to fingerprint: no inflow at all, or a single period
    // with no diversity/trend to reason about.
    if (fp.periodCount === 0 || profile.totalInflow <= 0) return null;

    // --- Component sub-scores (each 0..1) ----------------------------------

    // (a) Volatility: high coefficient of variation in period inflow means
    //     lumpy, irregular receipts. CV of ~1.0+ is highly irregular.
    const volatilityScore =
      fp.periodCount >= 2 ? clamp01(fp.inflowCoefficientOfVariation / 1.5) : 0;

    // (b) Rising-inflow trend vs declared income. A positive normalised slope
    //     (later periods materially larger than earlier ones) is concerning;
    //     it is AMPLIFIED when declared income is low relative to inflow.
    const trendScore = clamp01(fp.normalisedInflowSlope); // 0..1, only positive slopes count
    const declaredRatio = profile.declaredIncome > 0
      ? profile.declaredIncome / profile.totalInflow
      : 0;
    // 1.0 when nothing declared, decaying to 0 once declarations cover ~60% of inflow.
    const underDeclarationFactor = clamp01(1 - declaredRatio / 0.6);
    const risingUndisclosedScore = clamp01(trendScore * (0.4 + 0.6 * underDeclarationFactor));

    // (c) Sudden new high-value provider entering mid/late year.
    const newProviderScore = clamp01(fp.newHighValueProviderShare);

    // (d) Balance retention: inflow that is neither retained (closing≈opening)
    //     nor explained by declared income suggests pass-through / sweeping.
    //     Low retention combined with under-declaration is the concerning case.
    const passThroughScore = clamp01(fp.passThroughRatio) * underDeclarationFactor;

    // --- Aggregate score ----------------------------------------------------
    // Weighted blend. Rising-undisclosed and new-provider signals are the most
    // direct undisclosed-income tells, so they carry the most weight.
    //
    // DATA-AVAILABILITY RENORMALISATION. Some sub-scores are structurally 0 when
    // the source data lacks the fields they need — bank-filing records carry no
    // opening/closing balances (so passThrough and the balance side of the
    // new-provider signal are always 0) and few taxpayers have a declared-income
    // figure. With fixed weights those dead components silently cap the max score
    // below the suppression threshold, so the agent emits NOTHING even when the
    // live signals (volatility, rising inflow) are strong. To fix, we blend only
    // over the components that have usable inputs and renormalise their weights.
    const components: { score: number; weight: number; usable: boolean }[] = [
      { score: risingUndisclosedScore, weight: 0.40, usable: fp.periodCount >= 2 },
      { score: newProviderScore,       weight: 0.25, usable: fp.newHighValueProviderShare > 0 },
      { score: volatilityScore,        weight: 0.20, usable: fp.periodCount >= 2 },
      // passThrough needs opening/closing balances. Gate on whether the data was
      // REPORTED, not on whether the computed ratio happens to be non-zero: a
      // record set with no balances and one where closing exactly equals opening
      // both produce 0, yet they mean opposite things. The first is absent data
      // and must be excluded; the second is a textbook pass-through account and
      // is the single most meaningful case this component exists to catch. The
      // old test discarded it.
      { score: passThroughScore,       weight: 0.15, usable: fp.hasBalanceData },
    ];
    const usable = components.filter((c) => c.usable && c.weight > 0);
    const totalW = usable.reduce((s, c) => s + c.weight, 0);
    const score = totalW > 0
      ? clamp01(usable.reduce((s, c) => s + c.score * c.weight, 0) / totalW)
      : 0;

    // Suppress noise: nothing concerning enough to surface.
    if (score < 0.2) return null;

    const severity = severityFor(score);
    const summary = buildSummary(profile, fp, {
      risingUndisclosedScore,
      newProviderScore,
      volatilityScore,
      passThroughScore,
      underDeclarationFactor,
    });

    return {
      agentKey: this.key,
      score,
      severity,
      summary,
      details: {
        fingerprint: {
          periodCount: fp.periodCount,
          providerCount: profile.providerCount,
          totalInflow: round2(profile.totalInflow),
          totalOutflow: round2(profile.totalOutflow),
          declaredIncome: round2(profile.declaredIncome),
          declaredToInflowRatio: round4(declaredRatio),
          averageTransactionSize: round2(fp.averageTransactionSize),
          inflowMean: round2(fp.inflowMean),
          inflowStdDev: round2(fp.inflowStdDev),
          inflowCoefficientOfVariation: round4(fp.inflowCoefficientOfVariation),
          normalisedInflowSlope: round4(fp.normalisedInflowSlope),
          firstHalfInflow: round2(fp.firstHalfInflow),
          secondHalfInflow: round2(fp.secondHalfInflow),
          balanceRetentionRatio: round4(fp.balanceRetentionRatio),
          netBalanceChange: round2(fp.netBalanceChange),
          passThroughRatio: round4(fp.passThroughRatio),
          newHighValueProvider: fp.newHighValueProvider,
          newHighValueProviderName: fp.newHighValueProviderName,
          newHighValueProviderShare: round4(fp.newHighValueProviderShare),
          periodInflows: fp.periodInflows.map((p) => ({
            periodLabel: p.periodLabel,
            inflow: round2(p.inflow),
          })),
        },
        subScores: {
          risingUndisclosed: round4(risingUndisclosedScore),
          newHighValueProvider: round4(newProviderScore),
          inflowVolatility: round4(volatilityScore),
          passThrough: round4(passThroughScore),
        },
        limitations:
          'Day-of-week / time-of-day fingerprints are unavailable; only ' +
          'per-period aggregates were analysed (no transaction-level detail).',
      },
    };
  }
}

// ---------------------------------------------------------------------------
// Fingerprint model + builders (pure, exported for reuse/testing)
// ---------------------------------------------------------------------------

export interface PeriodInflow {
  periodLabel: string;
  order: number; // chronological index within the year
  inflow: number;
}

export interface BehaviouralFingerprint {
  periodCount: number;
  periodInflows: PeriodInflow[];

  /** totalInflow / transactionCount (0 when no transactions). */
  averageTransactionSize: number;

  /** Mean / std-dev / coefficient-of-variation of per-period inflow. */
  inflowMean: number;
  inflowStdDev: number;
  inflowCoefficientOfVariation: number;

  /**
   * Inflow trend across the year, normalised to [-1, 1] as
   * (secondHalf - firstHalf) / (secondHalf + firstHalf). Positive = rising.
   */
  normalisedInflowSlope: number;
  firstHalfInflow: number;
  secondHalfInflow: number;

  /**
   * Balance retention = netBalanceChange / totalInflow. ~0 means money flowed
   * straight through; ~1 means most inflow was retained on the balance.
   */
  balanceRetentionRatio: number;
  netBalanceChange: number;
  /** 1 - |retention|, i.e. how "pass-through" the account looks. */
  passThroughRatio: number;
  /**
   * Whether ANY contributing record carried balance figures. Without this the
   * pass-through signal cannot be trusted in either direction — see the gate in
   * the scorer.
   */
  hasBalanceData: boolean;

  /** Id of a provider that first appears in the later year and is high-value. */
  newHighValueProvider: string | null;
  /**
   * That provider's human-readable name. Kept separate from the id rather than
   * replacing it: the summary needs something an analyst can act on, and the
   * details need something a machine can join back to the provider record.
   */
  newHighValueProviderName: string | null;
  /** That provider's share of total inflow (0 if none). */
  newHighValueProviderShare: number;
}

/**
 * Derive a chronological order index for a record. periodYear is the primary
 * key; within a year we parse a leading number out of the period label
 * (e.g. "Q3", "March", "2024-07", "P11") so we sort deterministically without
 * assuming a fixed cadence. Falls back to month-name lookup, then to 0.
 */
export function periodOrder(rec: ProfileRecord): number {
  const yearBase = (rec.periodYear || 0) * 100;
  const label = (rec.periodLabel || '').toLowerCase();

  // Quarter form "YYYY-Qn" / "Qn" — map to month-of-quarter-start so it orders
  // and interleaves correctly with monthly labels. IMPORTANT: match the quarter
  // digit specifically; a naive \d+ would grab the YEAR out of "2025-q1" and
  // collapse every quarter of a year onto the same order key (which silently
  // flattened multi-quarter taxpayers to a single period).
  const q = label.match(/q\s*([1-4])/);
  if (q) return yearBase + (Number(q[1]) - 1) * 3 + 1; // Q1->1, Q2->4, Q3->7, Q4->10

  const month = MONTHS.findIndex((m) => label.includes(m));
  if (month >= 0) return yearBase + (month + 1);

  // "YYYY-MM" numeric month form: take the MONTH (the 1-2 digit group after the
  // year), not the year. Fall back to the last number in the label otherwise.
  const ym = label.match(/^\d{4}[-/](\d{1,2})/);
  if (ym) return yearBase + Number(ym[1]);
  const nums = label.match(/\d+/g);
  if (nums) {
    // ignore a leading 4-digit year token; use the next number as the ordinal.
    const rel = nums.find((n) => !(n.length === 4 && Number(n) === (rec.periodYear || 0)));
    if (rel) return yearBase + Number(rel);
  }

  return yearBase;
}

const MONTHS = [
  'jan', 'feb', 'mar', 'apr', 'may', 'jun',
  'jul', 'aug', 'sep', 'oct', 'nov', 'dec',
];

export function buildFingerprint(profile: TaxpayerProfile): BehaviouralFingerprint {
  const records = profile.records ?? [];

  // Aggregate inflow per chronological period (multiple accounts can report
  // the same period; we sum them so the trend reflects the whole taxpayer).
  const byPeriod = new Map<number, PeriodInflow>();
  for (const rec of records) {
    const order = periodOrder(rec);
    const key = order;
    const existing = byPeriod.get(key);
    const inflow = num(rec.totalInflow);
    if (existing) {
      existing.inflow += inflow;
    } else {
      byPeriod.set(key, {
        periodLabel: rec.periodLabel,
        order,
        inflow,
      });
    }
  }

  const periodInflows = Array.from(byPeriod.values()).sort((a, b) => a.order - b.order);
  const periodCount = periodInflows.length;

  const averageTransactionSize =
    profile.transactionCount > 0 ? profile.totalInflow / profile.transactionCount : 0;

  // Volatility across periods.
  const inflows = periodInflows.map((p) => p.inflow);
  const inflowMean = mean(inflows);
  const inflowStdDev = stdDev(inflows, inflowMean);
  const inflowCoefficientOfVariation = inflowMean > 0 ? inflowStdDev / inflowMean : 0;

  // First-half vs second-half inflow (chronological split) → trend.
  const mid = Math.floor(periodCount / 2);
  const firstHalfInflow = sum(inflows.slice(0, mid > 0 ? mid : 0));
  const secondHalfInflow = sum(inflows.slice(mid));
  const denom = firstHalfInflow + secondHalfInflow;
  const normalisedInflowSlope =
    periodCount >= 2 && denom > 0 ? (secondHalfInflow - firstHalfInflow) / denom : 0;

  // Balance retention from earliest opening to latest closing.
  const ordered = [...records].sort((a, b) => periodOrder(a) - periodOrder(b));
  const firstOpening = ordered.length ? num(ordered[0].openingBalance) : 0;
  const lastClosing = ordered.length ? num(ordered[ordered.length - 1].closingBalance) : 0;
  const netBalanceChange = lastClosing - firstOpening;
  const balanceRetentionRatio =
    profile.totalInflow > 0 ? netBalanceChange / profile.totalInflow : 0;
  const passThroughRatio = clamp01(1 - Math.abs(balanceRetentionRatio));
  // Did any record actually report balances? Most bank filings do not.
  const hasBalanceData = records.some((r) => r.hasBalances);

  // Sudden new high-value provider: a provider whose earliest period is in the
  // later part of the year yet contributes a large share of total inflow.
  const {
    provider: newHighValueProvider,
    providerName: newHighValueProviderName,
    share: newHighValueProviderShare,
  } = detectNewHighValueProvider(records, profile.totalInflow);

  return {
    periodCount,
    periodInflows,
    averageTransactionSize,
    inflowMean,
    inflowStdDev,
    inflowCoefficientOfVariation,
    normalisedInflowSlope,
    firstHalfInflow,
    secondHalfInflow,
    balanceRetentionRatio,
    netBalanceChange,
    passThroughRatio,
    hasBalanceData,
    newHighValueProvider,
    newHighValueProviderName,
    newHighValueProviderShare,
  };
}

/**
 * Find a provider that (a) only starts appearing in the later half of the
 * observed timeline, and (b) accounts for a meaningful share (>=20%) of total
 * inflow. Returns the highest-share such provider. Pure and deterministic.
 */
export function detectNewHighValueProvider(
  records: ProfileRecord[],
  totalInflow: number,
): { provider: string | null; providerName: string | null; share: number } {
  if (!records.length || totalInflow <= 0) return { provider: null, providerName: null, share: 0 };

  const orders = records.map(periodOrder);
  const minOrder = Math.min(...orders);
  const maxOrder = Math.max(...orders);
  if (minOrder === maxOrder) return { provider: null, providerName: null, share: 0 }; // single period: nothing "new"

  const span = maxOrder - minOrder;
  const lateThreshold = minOrder + span / 2; // strictly after the midpoint = "late entry"

  // Per provider: earliest appearance + total inflow.
  // Keyed by id, but carrying the resolved name: findings are read by analysts,
  // and "a4f3c1e2-…" is not something anyone can act on. Grouping still uses the
  // id so two providers sharing a name can never be merged.
  const stats = new Map<string, { firstOrder: number; inflow: number; name: string | null }>();
  for (const rec of records) {
    const id = rec.providerId || 'unknown';
    const order = periodOrder(rec);
    const inflow = num(rec.totalInflow);
    const s = stats.get(id);
    if (s) {
      s.firstOrder = Math.min(s.firstOrder, order);
      s.inflow += inflow;
      if (!s.name && rec.providerName) s.name = rec.providerName;
    } else {
      stats.set(id, { firstOrder: order, inflow, name: rec.providerName ?? null });
    }
  }

  let best: { provider: string; providerName: string | null; share: number } | null = null;
  for (const [id, s] of stats) {
    if (s.firstOrder <= lateThreshold) continue; // not a late entrant
    const share = s.inflow / totalInflow;
    if (share >= 0.2 && (!best || share > best.share)) {
      best = { provider: id, providerName: s.name ?? null, share };
    }
  }

  return best
    ? { provider: best.provider, providerName: best.providerName, share: best.share }
    : { provider: null, providerName: null, share: 0 };
}

/** Naira for prose — short scale, so a summary stays readable at a glance. */
function money(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e9) return `₦${(n / 1e9).toFixed(2)}bn`;
  if (a >= 1e6) return `₦${(n / 1e6).toFixed(2)}m`;
  if (a >= 1e3) return `₦${Math.round(n).toLocaleString('en-NG')}`;
  return `₦${n.toFixed(2)}`;
}

/**
 * Is the first half so small that the trend percentage says more about the
 * baseline than about the taxpayer? A half worth under 1% of the other pins the
 * normalised slope near 100% whatever the money actually did.
 */
function negligibleBaseline(fp: { firstHalfInflow: number; secondHalfInflow: number }): boolean {
  const { firstHalfInflow: a, secondHalfInflow: b } = fp;
  return b > 0 && a >= 0 && a < b * 0.01;
}

function buildSummary(
  profile: TaxpayerProfile,
  fp: BehaviouralFingerprint,
  s: {
    risingUndisclosedScore: number;
    newProviderScore: number;
    volatilityScore: number;
    passThroughScore: number;
    underDeclarationFactor: number;
  },
): string {
  const who = profile.businessName
    || [profile.firstName, profile.lastName].filter(Boolean).join(' ')
    || profile.taxpayerId;
  const parts: string[] = [];

  if (s.risingUndisclosedScore >= 0.33) {
    // Quote the halves, never a bare percentage. The slope is normalised to
    // (second − first) / (first + second), so a negligible first half pins it at
    // ~100% however small the rise is in money terms: ₦2,205 followed by ₦131.9m
    // reads as "100% higher", which is arithmetically true and tells the reader
    // nothing. The figures let an officer judge the baseline for themselves.
    const pct = Math.round(fp.normalisedInflowSlope * 100);
    const shape = `${money(fp.firstHalfInflow)} → ${money(fp.secondHalfInflow)}, +${pct}% net`;
    const caveat = negligibleBaseline(fp)
      ? ' The first half is negligible next to the second, so that percentage reflects a near-zero base rather than sustained growth.'
      : '';
    if (s.underDeclarationFactor >= 0.5 && !profile.hasDeclaration) {
      parts.push(
        `Inflows trend upward across the year (${shape}) ` +
        `with no income declaration on file — a pattern consistent with emerging undisclosed income.${caveat}`,
      );
    } else {
      parts.push(
        `Inflows trend upward across the year (${shape}) ` +
        `against low declared income relative to banked receipts.${caveat}`,
      );
    }
  }

  if (fp.newHighValueProvider && s.newProviderScore >= 0.2) {
    // Name the institution. This is the REPORTING provider — the bank that filed
    // the return — not a counter-party the taxpayer transacted with. Calling it a
    // counter-party invites the reader to think we can see who paid them; a §29
    // return carries no counter-party at all.
    parts.push(
      `${fp.newHighValueProviderName ?? fp.newHighValueProvider} first reports for this taxpayer ` +
      `only later in the year, yet accounts for ` +
      `${Math.round(fp.newHighValueProviderShare * 100)}% of total inflow.`,
    );
  }

  // A coefficient of variation needs more than two points to carry information;
  // from exactly two it merely restates the trend already reported above.
  if (fp.periodCount >= 3 && s.volatilityScore >= 0.4) {
    parts.push(
      `Period-to-period inflow is highly irregular (coefficient of variation ` +
      `${fp.inflowCoefficientOfVariation.toFixed(2)}).`,
    );
  }

  // Only assert pass-through when balances were actually REPORTED. Without them
  // retention computes to 0, which inverts to a maximal pass-through ratio — so
  // the absence of data reads as the strongest possible evidence of sweeping.
  // The score already excludes this component (see `usable`); the sentence must
  // match, or the narrative accuses on data nobody supplied.
  if (fp.hasBalanceData && s.passThroughScore >= 0.33) {
    parts.push(
      `Most inflow is not retained on the balance (pass-through), leaving the destination of ` +
      `funds unexplained by declared income.`,
    );
  }

  if (parts.length === 0) {
    parts.push(
      `Behavioural fingerprint shows mild deviations across ${fp.periodCount} period(s) for ${who}.`,
    );
  } else {
    parts.unshift(`Behavioural fingerprint for ${who}:`);
  }

  parts.push(
    'Note: only per-period aggregates were available — day-of-week/time-of-day behaviour could not be assessed.',
  );

  return parts.join(' ');
}

// ---------------------------------------------------------------------------
// Small numeric helpers (pure)
// ---------------------------------------------------------------------------

function num(n: number): number {
  return Number.isFinite(n) ? n : 0;
}

function sum(arr: number[]): number {
  return arr.reduce((a, b) => a + b, 0);
}

function mean(arr: number[]): number {
  return arr.length ? sum(arr) / arr.length : 0;
}

function stdDev(arr: number[], m: number): number {
  if (arr.length <= 1) return 0;
  const variance = arr.reduce((a, b) => a + (b - m) * (b - m), 0) / arr.length;
  return Math.sqrt(variance);
}

function round2(n: number): number {
  return Math.round(num(n) * 100) / 100;
}

function round4(n: number): number {
  return Math.round(num(n) * 10000) / 10000;
}
