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

/**
 * Columns common to every provider type. `sector` and `businessType` let a
 * provider supply the taxpayer's economic sector and nature of business at
 * source — far more reliable than inferring it from an account name.
 *
 * The identity/contact columns below improve entity resolution and taxpayer
 * contactability at source: `tin` is the strongest taxpayer-matching key (the
 * resolver already consumes it), `rcNumber` links corporate account holders to
 * their CAC registration, and phone/address/email aid matching and follow-up.
 * All are optional so providers who cannot supply them still submit valid files.
 */
// Enforcement date for the phased-in compulsory fields (user decision 2026-07-06):
// sector / businessType / customerType warn now and become hard-required on this
// date. Overridable at runtime via StatutoryConfig.piiEnforcementDate.
export const COMPULSORY_FIELD_ENFORCE_FROM = '2027-01-01';

const COMMON_COLUMNS: FieldDef[] = [
  // Hard-required now, every provider type (user decision 2026-07-06).
  { name: 'nin', required: true, type: 'string', validation: { length: 11 } }, // National Identity Number (11 digits)
  // Hard-required now: every transaction must carry the date it occurred, so it
  // can be placed in the correct reporting period. Rows with a missing/blank
  // transactionDate are rejected (user decision 2026-07-19 — the erev import
  // left 72% of rows undated, which is what this prevents recurring).
  { name: 'transactionDate', required: true, type: 'string', validation: { format: 'date' } }, // YYYY-MM-DD
  // Soft-required: warn now, hard-required from COMPULSORY_FIELD_ENFORCE_FROM.
  { name: 'sector', required: true, type: 'string', validation: { enforceFrom: COMPULSORY_FIELD_ENFORCE_FROM } },
  { name: 'businessType', required: true, type: 'string', validation: { enforceFrom: COMPULSORY_FIELD_ENFORCE_FROM } },
  { name: 'customerType', required: true, type: 'string', validation: { enum: ['INDIVIDUAL', 'CORPORATE'], enforceFrom: COMPULSORY_FIELD_ENFORCE_FROM } },
  // Optional identity / contact / metadata.
  { name: 'tin', required: false, type: 'string' },             // Tax Identification Number (strongest match key)
  { name: 'rcNumber', required: false, type: 'string' },        // CAC registration number (corporate account holders)
  { name: 'phoneNumber', required: false, type: 'string' },     // contact MSISDN, e.g. 0803...
  { name: 'customerAddress', required: false, type: 'string' }, // account holder / customer address
  { name: 'customerEmail', required: false, type: 'string', validation: { format: 'email' } },
  { name: 'transactionDescription', required: false, type: 'string' }, // narrative / notes
  { name: 'currency', required: false, type: 'string', validation: { format: 'currency' } }, // ISO 4217, defaults NGN
  { name: 'conversionRate', required: false, type: 'decimal', validation: { min: 0 } }, // rate to NGN if currency ≠ NGN
];

const BASE_SCHEMAS: Record<string, SchemaTemplate> = {
  BANK: {
    providerType: 'BANK',
    columns: [
      { name: 'bankCode', required: true, type: 'string' },
      { name: 'bankName', required: true, type: 'string' },
      { name: 'accountNumber', required: true, type: 'string', validation: { length: 10 } },
      { name: 'bvn', required: true, type: 'string', validation: { length: 11 } },
      // nin now comes from COMMON_COLUMNS (compulsory, all types).
      { name: 'accountName', required: true, type: 'string' },
      { name: 'periodLabel', required: true, type: 'string' },
      { name: 'totalInflow', required: true, type: 'decimal', validation: { min: 0 } },
      { name: 'totalOutflow', required: false, type: 'decimal', validation: { min: 0 } },
      { name: 'openingBalance', required: true, type: 'decimal' },
      { name: 'closingBalance', required: true, type: 'decimal' },
      { name: 'transactionCount', required: false, type: 'integer' },
      // §6.2 extended columns (optional aliases / extras; periodQuarter aliases periodLabel,
      // totalCreditTransactions aliases transactionCount — normalised in processRows).
      { name: 'periodQuarter', required: false, type: 'string' },
      { name: 'accountType', required: false, type: 'string' },
      { name: 'totalCreditTransactions', required: false, type: 'integer' },
      { name: 'totalDebitTransactions', required: false, type: 'integer' },
      { name: 'residentialState', required: false, type: 'string' },
      { name: 'accountOpenedDate', required: false, type: 'string' },
      { name: 'reportingBranch', required: false, type: 'string' },
    ],
  },
  FINTECH: {
    providerType: 'FINTECH',
    columns: [
      { name: 'walletId', required: true, type: 'string' },
      { name: 'phoneNumber', required: true, type: 'string' },
      { name: 'bvn', required: false, type: 'string', validation: { length: 11 } },
      // nin now comes from COMMON_COLUMNS (compulsory, all types).
      { name: 'accountName', required: true, type: 'string' },
      { name: 'periodLabel', required: true, type: 'string' },
      { name: 'totalInflow', required: true, type: 'decimal', validation: { min: 0 } },
      { name: 'totalOutflow', required: false, type: 'decimal', validation: { min: 0 } },
      { name: 'transactionCount', required: false, type: 'integer' },
    ],
  },
  TELCO: {
    providerType: 'TELCO',
    columns: [
      { name: 'phoneNumber', required: true, type: 'string' },
      // nin now comes from COMMON_COLUMNS (compulsory, all types).
      { name: 'accountName', required: true, type: 'string' },
      { name: 'periodLabel', required: true, type: 'string' },
      { name: 'totalInflow', required: false, type: 'decimal' },
      { name: 'transactionCount', required: false, type: 'integer' },
      { name: 'airtimeSpend', required: false, type: 'decimal' },
      { name: 'dataSpend', required: false, type: 'decimal' },
    ],
  },
  PAYMENT_PROCESSOR: {
    providerType: 'PAYMENT_PROCESSOR',
    columns: [
      { name: 'merchantId', required: true, type: 'string' },
      { name: 'accountName', required: true, type: 'string' },
      { name: 'periodLabel', required: true, type: 'string' },
      { name: 'totalInflow', required: true, type: 'decimal' },
      { name: 'transactionCount', required: false, type: 'integer' },
    ],
  },
  FX_BUREAU: {
    providerType: 'FX_BUREAU',
    columns: [
      { name: 'accountName', required: true, type: 'string' },
      { name: 'bvn', required: false, type: 'string' },
      { name: 'periodLabel', required: true, type: 'string' },
      { name: 'totalInflow', required: true, type: 'decimal' },
    ],
  },
  POS_AGGREGATOR: {
    providerType: 'POS_AGGREGATOR',
    columns: [
      { name: 'merchantId', required: true, type: 'string' },
      { name: 'accountName', required: true, type: 'string' },
      { name: 'periodLabel', required: true, type: 'string' },
      { name: 'totalInflow', required: true, type: 'decimal' },
      { name: 'transactionCount', required: false, type: 'integer' },
    ],
  },
  ECOMMERCE: {
    providerType: 'ECOMMERCE',
    columns: [
      { name: 'merchantId', required: true, type: 'string' },
      { name: 'accountName', required: true, type: 'string' },
      { name: 'periodLabel', required: true, type: 'string' },
      { name: 'totalInflow', required: true, type: 'decimal' },
    ],
  },
  INSURANCE: {
    providerType: 'INSURANCE',
    columns: [
      { name: 'policyNumber', required: true, type: 'string' },
      { name: 'accountName', required: true, type: 'string' }, // policyholder name
      { name: 'bvn', required: false, type: 'string', validation: { length: 11 } },
      // nin now comes from COMMON_COLUMNS (compulsory, all types).
      { name: 'periodLabel', required: true, type: 'string' },
      { name: 'totalInflow', required: true, type: 'decimal', validation: { min: 0 } }, // premiums paid
      { name: 'sumAssured', required: false, type: 'decimal', validation: { min: 0 } },
      { name: 'policyType', required: false, type: 'string' }, // life, general, takaful, etc.
      { name: 'transactionCount', required: false, type: 'integer' }, // number of premium payments
      // rcNumber & phoneNumber now come from COMMON_COLUMNS.
    ],
  },
  OTHER: {
    providerType: 'OTHER',
    columns: [
      { name: 'accountName', required: true, type: 'string' },
      { name: 'periodLabel', required: true, type: 'string' },
      { name: 'totalInflow', required: false, type: 'decimal' },
    ],
  },
};

/**
 * Canonical column order — groups related fields so every template reads in a
 * logical sequence regardless of provider type: identifiers → customer identity
 * → contact → profile → period → financials → activity → narrative. Columns not
 * listed here keep their original relative order at the end (stable sort). Adjust
 * this list, not the per-type schemas, to reorder templates.
 */
const COLUMN_ORDER: string[] = [
  // Account / provider identifiers
  'bankCode', 'bankName', 'accountNumber', 'accountType', 'reportingBranch', 'accountOpenedDate',
  'walletId', 'merchantId', 'policyNumber',
  // Customer identity
  'accountName', 'customerType', 'bvn', 'nin', 'tin', 'rcNumber',
  // Customer contact
  'phoneNumber', 'customerEmail', 'customerAddress', 'residentialState',
  // Customer profile
  'sector', 'businessType', 'policyType',
  // Reporting period
  'periodLabel', 'periodQuarter', 'transactionDate',
  // Financials
  'totalInflow', 'totalOutflow', 'openingBalance', 'closingBalance', 'sumAssured',
  'airtimeSpend', 'dataSpend', 'currency', 'conversionRate',
  // Activity counts
  'transactionCount', 'totalCreditTransactions', 'totalDebitTransactions',
  // Narrative
  'transactionDescription',
];
const ORDER_INDEX: Record<string, number> = Object.fromEntries(COLUMN_ORDER.map((n, i) => [n, i]));

function orderColumns(cols: FieldDef[]): FieldDef[] {
  const rank = (name: string) => (name in ORDER_INDEX ? ORDER_INDEX[name] : COLUMN_ORDER.length);
  // Stable sort: decorate with original index so unlisted columns keep their order.
  return cols
    .map((c, i) => ({ c, i }))
    .sort((a, b) => rank(a.c.name) - rank(b.c.name) || a.i - b.i)
    .map((x) => x.c);
}

// Every provider schema also accepts the common columns. A type-specific
// definition wins over the common one of the same name (e.g. FINTECH/TELCO keep
// their REQUIRED phoneNumber), so no column is ever duplicated in a template.
// The merged list is then sorted into the canonical relevance order above.
export const DEFAULT_SCHEMAS: Record<string, SchemaTemplate> = Object.fromEntries(
  Object.entries(BASE_SCHEMAS).map(([type, schema]) => {
    const own = new Set(schema.columns.map((c) => c.name));
    const merged = [...schema.columns, ...COMMON_COLUMNS.filter((c) => !own.has(c.name))];
    return [type, { ...schema, columns: orderColumns(merged) }];
  }),
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
