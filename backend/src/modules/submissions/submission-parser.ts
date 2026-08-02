import { Prisma } from '@prisma/client';

/**
 * Default provider-type schemas. Each describes which CSV columns are required/optional
 * for a given provider type, and how to extract DataRecord fields from them.
 */

export interface FieldDef {
  name: string;
  required: boolean;
  type: 'string' | 'decimal' | 'integer';
  validation?: {
    length?: number;
    min?: number;
    max?: number;
    pattern?: string;
    /** Allowed values (case-insensitive) — e.g. INDIVIDUAL / CORPORATE. */
    enum?: string[];
    /** Named format check applied to string values. */
    format?: 'email' | 'date' | 'currency';
    /**
     * Grace period for a compulsory field. When set on a `required` column, a
     * blank value is a WARNING (row still accepted) BEFORE this date, and a hard
     * ERROR (row rejected) ON/AFTER it. ISO date, e.g. '2027-01-01'. The actual
     * date is resolved at validation time from StatutoryConfig, so this literal
     * is only a fallback default. Omit for fields that are hard-required now.
     */
    enforceFrom?: string;
  };
}

export interface SchemaTemplate {
  providerType: string;
  columns: FieldDef[];
}

// Fallback grace-period date for a phased-in compulsory field — a column marked
// `required` that also carries `enforceFrom` warns while blank and only starts
// rejecting on that date (overridable at runtime via
// StatutoryConfig.fieldEnforcementDate).
//
// NO COLUMN USES IT TODAY. The seven-column return is compulsory in full from
// the moment it ships (user decision 2026-07-31) — the earlier phase-in for
// customerType is withdrawn. The mechanism stays for the next column that needs
// to be introduced gently; until one does, this constant is only the default the
// settings screen shows.
export const COMPULSORY_FIELD_ENFORCE_FROM = '2027-01-01';

/**
 * CUSTOMER TYPE — a natural person, or one of the five classes of organisation
 * the Corporate Affairs Commission registers under CAMA 2020.
 *
 * The class is not cosmetic: it decides which authority may assess the party.
 * The three limited forms (LTD / PLC / LTD-GTE) are limited-liability companies,
 * assessed FEDERALLY on income (CIT), so a State IRS raises no income case
 * against them. A Business Name, an Incorporated Trustees body, and an
 * individual all remain state-assessable. See `isLimitedLiability` on Taxpayer
 * and the LLC skip in ScanService.
 */
export const CUSTOMER_TYPES = [
  'INDIVIDUAL',            // natural person
  'BUSINESS_NAME',         // BN — sole proprietorship / partnership (CAMA Part E)
  'PRIVATE_LIMITED',       // LTD — private company limited by shares
  'PUBLIC_LIMITED',        // PLC — public company limited by shares
  'LIMITED_BY_GUARANTEE',  // LTD/GTE — company limited by guarantee
  'INCORPORATED_TRUSTEES', // IT — incorporated trustees (CAMA Part F)
] as const;
export type CustomerType = (typeof CUSTOMER_TYPES)[number];

/** The CAC classes that are limited-liability companies (federal CIT, not state income tax). */
export const LIMITED_LIABILITY_CUSTOMER_TYPES: readonly CustomerType[] = [
  'PRIVATE_LIMITED',
  'PUBLIC_LIMITED',
  'LIMITED_BY_GUARANTEE',
];

/**
 * THE RETURN TEMPLATE — seven columns, identical for every provider type
 * (user decision 2026-07-31).
 *
 * A §29 return now carries only what is needed to identify the party and size
 * its activity. Everything the older per-type templates asked for is gone:
 * bank/wallet/merchant/policy identifiers, opening & closing balances,
 * transaction counts, sector, businessType, tin, rcNumber, the contact columns,
 * currency/conversionRate, and the per-row transactionDate.
 *
 * ALL SEVEN ARE COMPULSORY, with no grace period (user decision 2026-07-31): a
 * row that leaves any of them blank is rejected, and a file whose header omits
 * any of them is rejected outright. There is nothing left to phase in — the
 * earlier warn-until-2027 treatment of customerType is withdrawn.
 *
 * The reporting period is deliberately NOT a column. It is chosen once per
 * submission in the portal and stamped onto every row (see
 * SubmissionsService.processRows), so a provider cannot mis-key it line by line.
 *
 * Columns a provider supplies BEYOND these seven are still read and kept, not
 * rejected — an institution that keeps filing its older, wider export continues
 * to work, and the extra values (bankCode, balances, …) still feed the checks
 * that can use them.
 */
export const RETURN_COLUMNS: FieldDef[] = [
  { name: 'nin', required: true, type: 'string', validation: { length: 11 } },       // National Identity Number
  { name: 'accountNumber', required: true, type: 'string' },                         // NUBAN for banks; wallet/merchant/policy id otherwise
  { name: 'accountName', required: true, type: 'string' },                           // name on the account
  { name: 'bvn', required: true, type: 'string', validation: { length: 11 } },       // Bank Verification Number
  { name: 'customerType', required: true, type: 'string', validation: { enum: [...CUSTOMER_TYPES] } },
  { name: 'totalInflow', required: true, type: 'decimal', validation: { min: 0 } },  // total credits for the period (₦)
  { name: 'totalOutflow', required: true, type: 'decimal', validation: { min: 0 } }, // total debits for the period (₦)
  // Tax Identification Number. OPTIONAL, and deliberately the only column that
  // is: TIN is the strongest matching key there is (0.97, above BVN's 0.95) and
  // banks already supply it in nine of the file layouts we receive, so it is
  // worth collecting — but a provider that genuinely holds no TIN for an account
  // must not have its entire file rejected by the all-or-nothing row validation.
  { name: 'tin', required: false, type: 'string' },
];

/**
 * When the seven-column return replaced the old per-type templates. A provider
 * who has not yet filed an ACCEPTED return since this date is still working from
 * the old format, so the portal tells them to re-pull the template — a file
 * missing any of the seven columns is now rejected in full.
 */
export const RETURN_TEMPLATE_CHANGED_AT = new Date('2026-07-31T00:00:00.000Z');

/** Every provider type the authority registers (mirrors the ProviderType enum). */
export const PROVIDER_TYPES = [
  'BANK', 'FINTECH', 'PAYMENT_PROCESSOR', 'TELCO', 'FX_BUREAU',
  'POS_AGGREGATOR', 'ECOMMERCE', 'INSURANCE', 'OTHER',
] as const;

/**
 * Every provider type files against the SAME seven-column return. A stored
 * ProviderSchema override (set by staff on /schemas) still wins at read time —
 * see SubmissionsService.resolveSchema and ProviderPortalService.uploadTemplate.
 */
export const DEFAULT_SCHEMAS: Record<string, SchemaTemplate> = Object.fromEntries(
  PROVIDER_TYPES.map((providerType) => [providerType, { providerType, columns: [...RETURN_COLUMNS] }]),
);

/**
 * Split a single CSV line into fields, honouring RFC-4180 quoting: a field
 * wrapped in double-quotes may contain commas, and a doubled quote ("") inside
 * such a field is a literal quote. Without this, an address or business name
 * like "12 Bello Way, Kano" would be split on its internal comma and silently
 * shift every following column. Field values are trimmed of surrounding space.
 */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { field += '"'; i++; } // escaped quote
        else inQuotes = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      out.push(field.trim());
      field = '';
    } else {
      field += ch;
    }
  }
  out.push(field.trim());
  return out;
}

export function parseCsvText(csvText: string): { headers: string[]; rows: Record<string, string>[] } {
  // Drop blank lines and comment lines (starting with '#'). Comment lines carry
  // the self-documenting column spec in downloaded templates; ignoring them here
  // means a provider can leave the guidance in and still upload cleanly.
  const lines = csvText
    .replace(/^﻿/, '')
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('#'));
  if (lines.length < 2) return { headers: [], rows: [] };
  const headers = splitCsvLine(lines[0]).map(h => h.trim());
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = splitCsvLine(lines[i]);
    // Skip an all-empty row (e.g. ",,,," — a trailing artifact from Excel/CSV
    // exports). Such a row carries no data and would otherwise fail every check.
    if (values.every((v) => v.trim() === '')) continue;
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => { row[h] = values[idx] ?? ''; });
    rows.push(row);
  }
  return { headers, rows };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CURRENCY_RE = /^[A-Za-z]{3}$/;

/**
 * Parse a date written in any of the formats banks commonly export, returning a
 * canonical 'YYYY-MM-DD' string, or null if it can't be understood. Providers do
 * not all use ISO dates — Excel and Nigerian bank systems emit DD/MM/YYYY,
 * DD-MM-YYYY, etc. Rather than reject those, we accept and normalise them.
 *
 * Accepted: YYYY-MM-DD, YYYY/MM/DD, DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY, and the
 * same with a 2-digit year. Ambiguous D/M vs M/D is resolved as DAY-first (the
 * dominant convention in NG/UK), except where a value can only be month-first
 * (first part > 12). Excel serial numbers (e.g. 46112) are also accepted.
 */
export function parseFlexibleDate(input: string): string | null {
  const s = (input ?? '').trim();
  if (!s) return null;

  // Already ISO.
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return isValidYmd(+m[1], +m[2], +m[3]) ? s : null;

  // YYYY/MM/DD
  m = s.match(/^(\d{4})[/](\d{1,2})[/](\d{1,2})$/);
  if (m) return ymd(+m[1], +m[2], +m[3]);

  // DD/MM/YYYY or MM/DD/YYYY (also '-' or '.' separators), 4- or 2-digit year.
  m = s.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2}|\d{4})$/);
  if (m) {
    let a = +m[1], b = +m[2];
    const year = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    // Day-first by default; swap only if the first part cannot be a day but the
    // second can (i.e. it's unambiguously month-first like 03/28/2026).
    if (a > 12 && b <= 12) { /* a=day, b=month — day-first, ok */ }
    else if (b > 12 && a <= 12) { [a, b] = [b, a]; } // month-first input → swap
    return ymd(year, b, a); // (year, month, day)
  }

  // Excel serial date (days since 1899-12-30). Reasonable range only.
  if (/^\d{4,6}$/.test(s)) {
    const serial = +s;
    if (serial >= 20000 && serial <= 60000) { // ~1954..2064
      const ms = (serial - 25569) * 86_400_000; // 25569 = days to 1970-01-01
      const d = new Date(ms);
      if (!Number.isNaN(d.getTime())) {
        return ymd(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
      }
    }
  }

  return null;
}

function isValidYmd(y: number, mo: number, d: number): boolean {
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

function ymd(y: number, mo: number, d: number): string | null {
  if (!isValidYmd(y, mo, d)) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Context for grace-period enforcement, resolved from StatutoryConfig at call time. */
export interface ValidationContext {
  /** "Now" for deciding whether a field's grace period has elapsed. */
  now?: Date;
  /** Overrides every soft field's enforceFrom date (e.g. from config). */
  enforceFrom?: string;
}

/**
 * Is a soft-required field's grace period over (i.e. blank should be a hard
 * error, not a warning)? True when now >= the effective enforcement date.
 */
function graceElapsed(col: FieldDef, ctx?: ValidationContext): boolean {
  const dateStr = ctx?.enforceFrom ?? col.validation?.enforceFrom;
  if (!dateStr) return true; // no grace configured → treat as fully enforced
  const enforceAt = new Date(dateStr);
  if (Number.isNaN(enforceAt.getTime())) return true;
  const now = ctx?.now ?? new Date();
  return now.getTime() >= enforceAt.getTime();
}

export function validateRow(
  row: Record<string, string>,
  schema: SchemaTemplate,
  ctx?: ValidationContext,
): { ok: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  for (const col of schema.columns) {
    const raw = (row[col.name] ?? '').trim();
    const present = raw !== '';

    // Required-field presence — this is how a column is made compulsory.
    if (col.required && !present) {
      // Soft-required (has enforceFrom) & still within its grace period → warn,
      // don't reject: the row is accepted but the provider is told the field
      // becomes mandatory on the enforcement date.
      if (col.validation?.enforceFrom && !graceElapsed(col, ctx)) {
        const when = (ctx?.enforceFrom ?? col.validation.enforceFrom);
        warnings.push(`${col.name} is blank — it becomes required from ${when}`);
      } else {
        errors.push(`${col.name} is required`);
      }
      continue;
    }
    if (!present) continue; // optional & blank → nothing more to check

    const v = col.validation;

    // Numeric fields
    if (col.type === 'decimal' || col.type === 'integer') {
      const n = Number(raw);
      if (Number.isNaN(n)) {
        errors.push(`${col.name} must be a number`);
        continue;
      }
      if (col.type === 'integer' && !Number.isInteger(n)) {
        errors.push(`${col.name} must be a whole number`);
      }
      if (v?.min != null && n < v.min) errors.push(`${col.name} must be at least ${v.min}`);
      if (v?.max != null && n > v.max) errors.push(`${col.name} must be at most ${v.max}`);
    }

    // String constraints
    if (col.type === 'string' && v) {
      // Exact-length identifiers (BVN=11, NIN=11, NUBAN=10). These are numeric
      // IDs, so require exactly N digits — reject letters or wrong length.
      if (v.length != null) {
        const digits = raw.replace(/\D/g, '');
        if (digits.length !== v.length || digits.length !== raw.length) {
          errors.push(`${col.name} must be exactly ${v.length} digits`);
        }
      }
      // Enumerated values (case-insensitive), e.g. customerType.
      if (v.enum && !v.enum.map((e) => e.toUpperCase()).includes(raw.toUpperCase())) {
        errors.push(`${col.name} must be one of: ${v.enum.join(', ')}`);
      }
      // Named formats
      if (v.format === 'email' && !EMAIL_RE.test(raw)) {
        errors.push(`${col.name} is not a valid email address`);
      }
      if (v.format === 'date') {
        // Accept common date formats (DD/MM/YYYY, Excel serial, …) and normalise
        // the stored value to YYYY-MM-DD. A date field only hard-fails when it's
        // REQUIRED; an optional metadata date that can't be parsed is a warning,
        // not a file-killing error.
        const normalised = parseFlexibleDate(raw);
        if (normalised) {
          row[col.name] = normalised; // self-heal for clean storage
        } else if (col.required) {
          errors.push(`${col.name} must be a valid date (e.g. 2026-03-31 or 31/03/2026)`);
        } else {
          warnings.push(`${col.name} "${raw}" is not a recognised date and was left as-is`);
        }
      }
      if (v.format === 'currency' && !CURRENCY_RE.test(raw)) {
        errors.push(`${col.name} must be a 3-letter currency code (e.g. NGN)`);
      }
      // Regex pattern (if a schema ever defines one)
      if (v.pattern && !new RegExp(v.pattern).test(raw)) {
        errors.push(`${col.name} has an invalid format`);
      }
    }
  }
  return { ok: errors.length === 0, errors, warnings };
}

/**
 * File-level guard: which REQUIRED columns are absent from the uploaded header
 * row. Returns the missing column names (empty = header is acceptable). Lets the
 * upload reject a wrong/mismatched file up front with a clear message instead of
 * failing every row with confusing per-row errors.
 */
export function missingRequiredColumns(headers: string[], schema: SchemaTemplate): string[] {
  const present = new Set(headers.map((h) => h.trim().toLowerCase()));
  return schema.columns
    .filter((c) => c.required && !present.has(c.name.toLowerCase()))
    .map((c) => c.name);
}

const MONTH_NAMES: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

/**
 * Parse a reporting period written in any of the forms providers actually use,
 * not just the canonical ones. Returns {year, quarter?, month?} or null.
 *
 * Accepted (case/space/separator-insensitive): 2026-Q1, 2026Q1, Q1 2026,
 * Q1-2026, 2026/Q1, 2026-01, 2026-1 (unpadded), 2026/01, 2026 (year only),
 * "Jan 2026" / "March 2026" (month name), and a full date like 2026-03-31 /
 * 31/03/2026 (→ that date's month & quarter). This is the single choke point for
 * period parsing, so making it lenient fixes CSV and JSON ingestion alike.
 */
export function parsePeriod(label: string): { year: number; quarter?: number; month?: number } | null {
  const s = (label ?? '').trim();
  if (!s) return null;

  // Quarter forms: Q1 2026 / 2026 Q1 / 2026-Q1 / 2026Q1 / 2026/Q1 (any order).
  let m = s.match(/^q([1-4])\D*(\d{4})$/i) || s.match(/^(\d{4})\D*q([1-4])$/i);
  if (m) {
    // First regex is Q-then-year, second is year-then-Q — detect by group shape.
    const qFirst = /^q/i.test(s);
    const year = parseInt(qFirst ? m[2] : m[1], 10);
    const quarter = parseInt(qFirst ? m[1] : m[2], 10);
    return { year, quarter };
  }

  // Year-month: 2026-01, 2026-1, 2026/01 (month 1–12, padded or not).
  m = s.match(/^(\d{4})[-/](\d{1,2})$/);
  if (m) {
    const year = parseInt(m[1], 10), month = parseInt(m[2], 10);
    if (month >= 1 && month <= 12) return { year, month };
    return null;
  }

  // Month name: "Jan 2026", "March-2026".
  m = s.match(/^([A-Za-z]{3,})\D+(\d{4})$/) || s.match(/^(\d{4})\D+([A-Za-z]{3,})$/);
  if (m) {
    const nameFirst = /^[A-Za-z]/.test(s);
    const name = (nameFirst ? m[1] : m[2]).slice(0, 3).toLowerCase();
    const year = parseInt(nameFirst ? m[2] : m[1], 10);
    if (MONTH_NAMES[name]) return { year, month: MONTH_NAMES[name] };
  }

  // Year only.
  if (/^\d{4}$/.test(s)) return { year: parseInt(s, 10) };

  // Fallback: a full date → use its month (and derived quarter).
  const iso = parseFlexibleDate(s);
  if (iso) {
    const [y, mo] = iso.split('-').map(Number);
    return { year: y, month: mo };
  }

  return null;
}

/** Canonical period-label string for a parsed period, for clean storage. */
export function normalizePeriodLabel(label: string): string | null {
  const p = parsePeriod(label);
  if (!p) return null;
  if (p.quarter) return `${p.year}-Q${p.quarter}`;
  if (p.month) return `${p.year}-${String(p.month).padStart(2, '0')}`;
  return `${p.year}`;
}

/**
 * The last calendar day (UTC, end-of-day) of a parsed reporting period.
 *  - quarter → 31 Mar / 30 Jun / 30 Sep / 31 Dec
 *  - month   → last day of that month
 *  - year    → 31 Dec
 */
export function periodEndDate(p: { year: number; quarter?: number; month?: number }): Date {
  if (p.quarter) {
    const endMonthExclusive = p.quarter * 3; // Q1→3, Q2→6, Q3→9, Q4→12
    return new Date(Date.UTC(p.year, endMonthExclusive, 0, 23, 59, 59, 999));
  }
  if (p.month) {
    return new Date(Date.UTC(p.year, p.month, 0, 23, 59, 59, 999));
  }
  return new Date(Date.UTC(p.year, 12, 0, 23, 59, 59, 999)); // 31 Dec
}

/** The first calendar day (UTC, start-of-day) of a parsed reporting period. */
export function periodStartDate(p: { year: number; quarter?: number; month?: number }): Date {
  if (p.quarter) {
    const startMonth = (p.quarter - 1) * 3; // Q1→0(Jan), Q2→3(Apr), Q3→6(Jul), Q4→9(Oct)
    return new Date(Date.UTC(p.year, startMonth, 1, 0, 0, 0, 0));
  }
  if (p.month) {
    return new Date(Date.UTC(p.year, p.month - 1, 1, 0, 0, 0, 0));
  }
  return new Date(Date.UTC(p.year, 0, 1, 0, 0, 0, 0)); // 1 Jan
}

/**
 * True if a transaction date (any parseable form) falls WITHIN the reporting
 * period being submitted. Used to reject rows whose date belongs to a different
 * (e.g. future) quarter than the return — you cannot file Q2 with Q3/Q4 rows.
 * Returns null when either the date or the period can't be parsed (caller
 * decides — usually a separate "invalid date/period" error already fired).
 */
export function dateInPeriod(dateStr: string, periodLabel: string): boolean | null {
  const iso = parseFlexibleDate(dateStr);
  const period = parsePeriod(periodLabel);
  if (!iso || !period) return null;
  const t = new Date(`${iso}T00:00:00.000Z`).getTime();
  if (Number.isNaN(t)) return null;
  return t >= periodStartDate(period).getTime() && t <= periodEndDate(period).getTime();
}

/**
 * True if the reporting period has fully ended as of `now`. A provider may only
 * submit for a period that is already closed — you cannot report a quarter that
 * has not finished. (now defaults to the current time.)
 */
export function periodHasEnded(
  p: { year: number; quarter?: number; month?: number },
  now: Date = new Date(),
): boolean {
  return periodEndDate(p).getTime() <= now.getTime();
}

export function toDecimal(v: string | undefined): Prisma.Decimal | null {
  if (!v) return null;
  const n = Number(v);
  if (isNaN(n)) return null;
  return new Prisma.Decimal(n);
}

export function toInt(v: string | undefined): number | null {
  if (!v) return null;
  const n = parseInt(v, 10);
  return isNaN(n) ? null : n;
}

export function extractBvn(s: string | undefined): string | null {
  if (!s) return null;
  const digits = s.replace(/\D/g, '');
  if (digits.length >= 11) return digits.slice(0, 11);
  return null;
}
