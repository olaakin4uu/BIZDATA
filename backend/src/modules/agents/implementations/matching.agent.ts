import {
  AnalyticsAgent,
  AgentContext,
  AgentSignal,
  TaxpayerProfile,
  severityFor,
  clamp01,
} from '../agent.types';

/**
 * Agent 2 — TIN-BVN Matching.
 *
 * Emits an *identity-confidence* signal. Provider records carry a per-account
 * `matchConfidence` (0..1) describing how well the bank record was linked to
 * the taxpayer's registration identity (TIN/BVN/name/DOB). When the average
 * confidence is low — e.g. records matched on name alone (~0.55) — enforcement
 * built on this profile is risky because some inflow may belong to a different
 * person. We surface that so an officer verifies identity *before* acting.
 *
 * Heuristic (works on available aggregates):
 *   - avgMatchConfidence = mean of non-null record matchConfidence, weighted by
 *     transaction volume so a high-confidence account with most of the activity
 *     does not get dragged down by a tiny low-confidence account (and vice-versa).
 *   - score = 1 - avgMatchConfidence  (lower confidence => higher concern).
 *   - severity via severityFor(score). A name-only match (~0.55) yields
 *     score ~0.45 (MEDIUM); weaker links push HIGH.
 *
 * Data reality: we only have a per-record confidence scalar, not the underlying
 * match features. Where confidence is missing entirely we degrade gracefully and
 * say so rather than assuming a perfect or a failed match.
 */
export class MatchingAgent implements AnalyticsAgent {
  readonly key = 'matching';
  readonly name = 'TIN-BVN Matching';

  analyze(profile: TaxpayerProfile, _ctx: AgentContext): AgentSignal | null {
    const records = profile.records ?? [];
    const scored = records.filter(
      (r) => typeof r.matchConfidence === 'number' && !Number.isNaN(r.matchConfidence),
    );

    // No confidence data at all — nothing this agent can assert. Degrade gracefully.
    if (scored.length === 0) {
      if (records.length === 0) return null;
      return {
        agentKey: this.key,
        score: 0.5,
        severity: severityFor(0.5),
        summary:
          'Identity-match confidence is unavailable on every linked account; ' +
          'verify the TIN/BVN linkage manually before relying on this profile for enforcement.',
        details: {
          recordsTotal: records.length,
          recordsWithConfidence: 0,
          avgMatchConfidence: null,
          degraded: true,
        },
      };
    }

    // Volume-weighted average confidence. Fall back to a simple mean when there
    // is no transaction volume to weight by (e.g. all counts are zero/unknown).
    const totalWeight = scored.reduce(
      (s, r) => s + Math.max(0, r.transactionCount || 0),
      0,
    );
    let avgMatchConfidence: number;
    if (totalWeight > 0) {
      avgMatchConfidence =
        scored.reduce(
          (s, r) =>
            s + clamp01(r.matchConfidence as number) * Math.max(0, r.transactionCount || 0),
          0,
        ) / totalWeight;
    } else {
      avgMatchConfidence =
        scored.reduce((s, r) => s + clamp01(r.matchConfidence as number), 0) /
        scored.length;
    }

    // Also report the plain (unweighted) mean and the weakest link for the officer.
    const plainMean =
      scored.reduce((s, r) => s + clamp01(r.matchConfidence as number), 0) /
      scored.length;
    const minConfidence = scored.reduce(
      (m, r) => Math.min(m, clamp01(r.matchConfidence as number)),
      1,
    );

    const score = clamp01(1 - avgMatchConfidence);
    const severity = severityFor(score);

    // Count accounts that look like name-only / weak matches for the narrative.
    const weakAccounts = scored.filter(
      (r) => clamp01(r.matchConfidence as number) < 0.66,
    ).length;

    let summary: string;
    if (avgMatchConfidence < 0.66) {
      summary =
        `Identity matched on name only (avg confidence ${(avgMatchConfidence * 100).toFixed(0)}%) — ` +
        `verify TIN/BVN linkage before enforcement; some inflow may belong to a different person.`;
    } else if (avgMatchConfidence < 0.9) {
      summary =
        `Identity link is moderately confident (avg ${(avgMatchConfidence * 100).toFixed(0)}%); ` +
        `${weakAccounts} of ${scored.length} account(s) are weakly matched and worth a spot-check.`;
    } else {
      summary =
        `Identity link is strong (avg confidence ${(avgMatchConfidence * 100).toFixed(0)}%) across ` +
        `${scored.length} account(s); no identity concern.`;
    }

    return {
      agentKey: this.key,
      score,
      severity,
      summary,
      details: {
        avgMatchConfidence: round4(avgMatchConfidence),
        avgMatchConfidenceUnweighted: round4(plainMean),
        minMatchConfidence: round4(minConfidence),
        recordsTotal: records.length,
        recordsWithConfidence: scored.length,
        weakMatchAccounts: weakAccounts,
        weightedByTransactionCount: totalWeight > 0,
        degraded: scored.length < records.length,
      },
    };
  }
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

/* ------------------------------------------------------------------------- *
 * Reusable pure helpers for the objection / identity-matching pipeline.
 *
 * These are exported so the matching/objection service can re-link bank
 * records to taxpayers (and adjudicate "this isn't me" objections) using the
 * same logic that backs the confidence scores this agent reads. All functions
 * are pure and deterministic (no IO, no Date.now/Math.random).
 * ------------------------------------------------------------------------- */

/**
 * Normalize a name for comparison:
 *   - lowercase, strip diacritics, drop punctuation
 *   - collapse whitespace
 *   - drop common Nigerian honorifics/titles that add no identity signal
 *     (Alhaji, Alhaja, Chief, Dr, Engr, Mr, Mrs, Hon, Pastor, etc.)
 */
export function normalizeName(raw: string | null | undefined): string {
  if (!raw) return '';
  const stripped = raw
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // remove combining accents
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ') // keep letters + spaces only
    .replace(/\s+/g, ' ')
    .trim();

  const titles = new Set([
    'alhaji', 'alhaja', 'alh', 'chief', 'dr', 'doc', 'engr', 'engineer',
    'mr', 'mrs', 'miss', 'ms', 'mallam', 'malam', 'hon', 'honourable',
    'pastor', 'pst', 'rev', 'reverend', 'prof', 'professor', 'barr',
    'barrister', 'sir', 'madam', 'oba', 'otunba', 'prince', 'princess',
  ]);

  const tokens = stripped.split(' ').filter((t) => t.length > 0 && !titles.has(t));
  return tokens.join(' ');
}

/**
 * Nigerian-tuned Soundex-style phonetic code. Standard Soundex is anglocentric;
 * this variant keeps it but additionally folds vowels and a few consonant
 * confusions common in Nigerian name transliteration so that spelling variants
 * encode the same:
 *   - Oluwaseun / Oluwasheun, Mohammed / Muhammad / Mohammad,
 *     Chukwu / Chukwuemeka prefix, Ngozi / Ngosi (s/z), f/v, p/b.
 * Returns a 4-char code (letter + 3 digits), like classic Soundex.
 */
export function nigerianSoundex(token: string): string {
  const t = token.toLowerCase().replace(/[^a-z]/g, '');
  if (!t) return '';

  // Pre-fold common Nigerian transliteration variants before coding.
  const folded = t
    .replace(/ph/g, 'f')
    .replace(/sh/g, 's')
    .replace(/ch/g, 'k') // Chukwu/Chinedu k-class onset
    .replace(/ck/g, 'k')
    .replace(/z/g, 's')
    .replace(/v/g, 'f')
    .replace(/qu/g, 'k')
    .replace(/x/g, 'ks');

  const code = (c: string): string => {
    if ('bfpv'.includes(c)) return '1';
    if ('cgjkqsxz'.includes(c)) return '2';
    if ('dt'.includes(c)) return '3';
    if (c === 'l') return '4';
    if ('mn'.includes(c)) return '5';
    if (c === 'r') return '6';
    return ''; // vowels, h, w, y
  };

  const first = folded[0];
  let out = first.toUpperCase();
  let prev = code(first);

  for (let i = 1; i < folded.length && out.length < 4; i++) {
    const d = code(folded[i]);
    if (d && d !== prev) out += d;
    // h/w do not reset the "previous code" (so b-h-b stays collapsed);
    // vowels do reset it (so they act as separators).
    if (folded[i] !== 'h' && folded[i] !== 'w') prev = d;
  }
  return (out + '000').slice(0, 4);
}

/** Levenshtein edit distance (iterative, two-row, O(n) space). */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let prev = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;

  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = cur;
  }
  return prev[b.length];
}

/** Normalized 0..1 Levenshtein similarity (1 = identical). */
function levSim(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}

/**
 * Nigerian-tuned phonetic + fuzzy NAME similarity, returning 0..1.
 *
 * Combines three signals and is robust to token reordering (Nigerian names are
 * frequently recorded surname-first on bank records but given-name-first on
 * registration):
 *
 *   1. Token-set overlap: greedily pair tokens across the two names, scoring
 *      each pair by max(phonetic match, character similarity), then average
 *      over the larger token count (so missing/extra tokens lower the score).
 *   2. Phonetic agreement: a token pair counts as a strong match when their
 *      nigerianSoundex codes are equal (handles spelling variants like
 *      Mohammed/Muhammad, Oluwaseun/Oluwasheun).
 *   3. Character fuzz: Levenshtein similarity catches typos the phonetic code
 *      misses (and vice-versa); we take the max of the two per pair.
 *
 * Returns 1 for an exact (post-normalization) match and 0 for empty input.
 */
export function nameSimilarity(
  a: string | null | undefined,
  b: string | null | undefined,
): number {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;

  const ta = na.split(' ').filter(Boolean);
  const tb = nb.split(' ').filter(Boolean);
  if (ta.length === 0 || tb.length === 0) return 0;

  // Order-independent greedy pairing: for each token in the smaller set, take
  // its best available match in the larger set.
  const [small, large] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  const used = new Array(large.length).fill(false);
  let sum = 0;

  for (const s of small) {
    let best = 0;
    let bestIdx = -1;
    for (let i = 0; i < large.length; i++) {
      if (used[i]) continue;
      const l = large[i];
      const phonetic =
        nigerianSoundex(s) !== '' && nigerianSoundex(s) === nigerianSoundex(l)
          ? 0.92 // strong, but reserve 1.0 for genuine char-level identity
          : 0;
      const fuzz = levSim(s, l);
      const pairScore = Math.max(phonetic, fuzz, s === l ? 1 : 0);
      if (pairScore > best) {
        best = pairScore;
        bestIdx = i;
      }
    }
    if (bestIdx >= 0) used[bestIdx] = true;
    sum += best;
  }

  // Average over the LARGER token count so unmatched extra tokens dilute score.
  const score = sum / large.length;
  return clamp01(score);
}

/**
 * Fuzzy DATE-OF-BIRTH match, returning 0..1.
 *
 * Accepts ISO-ish date strings (YYYY-MM-DD, or anything Date can parse). Common
 * registration data-quality issues are handled with graded partial credit:
 *
 *   - Exact same date                                  => 1.0
 *   - Day/month transposed (e.g. 1990-03-04 vs 04-03)  => 0.85 (data-entry swap)
 *   - Off by one day                                   => 0.8
 *   - Same year + month, day differs by >1             => 0.7
 *   - Same year only (month/day differ)                => 0.5
 *   - Year off by one (typo in year)                   => 0.4
 *   - Otherwise                                         => 0.0
 *
 * Returns 0 when either date is missing or unparseable (degrade gracefully —
 * the caller should treat 0 as "no DOB signal", not "confirmed mismatch").
 */
export function dobSimilarity(
  a: string | null | undefined,
  b: string | null | undefined,
): number {
  const pa = parseDob(a);
  const pb = parseDob(b);
  if (!pa || !pb) return 0;

  if (pa.y === pb.y && pa.m === pb.m && pa.d === pb.d) return 1;

  // Day/month transposition (valid swap, e.g. recorded MM-DD vs DD-MM).
  if (pa.y === pb.y && pa.m === pb.d && pa.d === pb.m) return 0.85;

  const sameYear = pa.y === pb.y;
  const sameMonth = pa.m === pb.m;

  if (sameYear && sameMonth && Math.abs(pa.d - pb.d) === 1) return 0.8;
  if (sameYear && sameMonth) return 0.7;
  if (sameYear) return 0.5;
  if (Math.abs(pa.y - pb.y) === 1 && sameMonth && pa.d === pb.d) return 0.4;

  return 0;
}

interface ParsedDob {
  y: number;
  m: number;
  d: number;
}

/** Parse a DOB string into {y,m,d}; returns null when unparseable. */
function parseDob(raw: string | null | undefined): ParsedDob | null {
  if (!raw) return null;
  const s = raw.trim();

  // Fast path: ISO YYYY-MM-DD (avoids Date() timezone quirks, stays deterministic).
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (iso) {
    const y = Number(iso[1]);
    const m = Number(iso[2]);
    const d = Number(iso[3]);
    if (validYmd(y, m, d)) return { y, m, d };
    return null;
  }

  // DD/MM/YYYY or DD-MM-YYYY (common Nigerian form).
  const dmy = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/.exec(s);
  if (dmy) {
    const d = Number(dmy[1]);
    const m = Number(dmy[2]);
    const y = Number(dmy[3]);
    if (validYmd(y, m, d)) return { y, m, d };
    return null;
  }

  return null;
}

function validYmd(y: number, m: number, d: number): boolean {
  return (
    Number.isInteger(y) &&
    Number.isInteger(m) &&
    Number.isInteger(d) &&
    y > 1900 &&
    y < 2200 &&
    m >= 1 &&
    m <= 12 &&
    d >= 1 &&
    d <= 31
  );
}
