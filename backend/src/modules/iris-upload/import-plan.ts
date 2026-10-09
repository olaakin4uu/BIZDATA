import {
  SchemaTemplate,
  FieldDef,
  parseFlexibleDate,
  normalizePeriodLabel,
  validateRow,
} from '../submissions/submission-parser';
import { validateIngestionRow } from '../submissions/ingestion-validators';
import { redactPii } from '../iris/llm/redaction';

/**
 * The IRIS Upload Assistant's mapping engine.
 *
 * The LLM never sees or restructures the full dataset — it only proposes a
 * COLUMN MAPPING from the provider's (possibly wrong/mixed) headers to the
 * canonical schema, given the headers + a small, PII-masked sample per column.
 * The mapping is then applied to every row DETERMINISTICALLY here, and value
 * normalization is driven by each canonical field's declared type — never by the
 * model. The model is explicitly barred from inventing values; a missing NIN
 * stays missing (and the row is reported as needing a fix).
 */

export interface ColumnMapping {
  /** A header from the uploaded file. */
  source: string;
  /** The canonical field it maps to, or '' to drop the column. */
  target: string;
  /** Model/heuristic confidence 0..1 (informational). */
  confidence?: number;
}

export interface PreviewRow {
  before: Record<string, string>;
  after: Record<string, string>;
}

export interface RowIssue {
  row: number; // 1-based data row
  errors: string[];
}

const SAMPLE_ROWS = 4;
const MAX_ISSUES = 30;
const MAX_PREVIEW = 8;

/** A small, PII-masked sample of values for each incoming column. */
export function columnSamples(headers: string[], rows: Record<string, string>[]): { header: string; samples: string[] }[] {
  return headers.map((h) => {
    const samples: string[] = [];
    for (const r of rows) {
      const v = (r[h] ?? '').trim();
      if (v) samples.push(redactPii(v));
      if (samples.length >= SAMPLE_ROWS) break;
    }
    return { header: h, samples };
  });
}

/* ─── LLM structured mapping ────────────────────────────────────────────────── */

export const MAPPING_SYSTEM =
  'You are the IRIS Upload Assistant for a Nigerian tax-intelligence platform. ' +
  'A financial institution uploaded a CSV whose column headings may be wrong, mixed, mislabeled, or out of order. ' +
  'Your ONLY job is to map each incoming column to the correct canonical field name. ' +
  'RULES: map to an EXACT canonical name from the provided list, or "" if a column does not correspond to any field. ' +
  'Never invent columns or values. Never map two incoming columns to the same field unless they clearly duplicate. ' +
  'Use the sample values (which are privacy-masked) to disambiguate — e.g. 10-digit numbers are account numbers, 11-digit are BVN/NIN, a column of dates is transactionDate.';

/** JSON schema for the structured-output mapping (no nullable unions — '' = drop). */
export const MAPPING_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    mappings: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          source: { type: 'string' },
          target: { type: 'string' },
          confidence: { type: 'number' },
        },
        required: ['source', 'target', 'confidence'],
      },
    },
  },
  required: ['mappings'],
} as const;

export function buildMappingPrompt(schema: SchemaTemplate, samples: { header: string; samples: string[] }[]): string {
  const fields = schema.columns
    .map((c) => `- ${c.name}${c.required ? ' (required)' : ''} [${c.type}${c.validation?.length ? `, ${c.validation.length} digits` : ''}${c.validation?.format ? `, ${c.validation.format}` : ''}]`)
    .join('\n');
  const cols = samples
    .map((s, i) => `${i + 1}. "${s.header}" — samples: ${s.samples.length ? s.samples.map((v) => `"${v}"`).join(', ') : '(all blank)'}`)
    .join('\n');
  return (
    `Canonical fields for a ${schema.providerType} submission:\n${fields}\n\n` +
    `Incoming file columns and PII-masked sample values:\n${cols}\n\n` +
    `Return { "mappings": [ { "source", "target", "confidence" } ] } — one entry per incoming column, ` +
    `target = the exact canonical field name it maps to, or "" if none.`
  );
}

/* ─── Heuristic fallback (no LLM / model disabled) ──────────────────────────── */

const ALIASES: Record<string, string[]> = {
  accountNumber: ['acctno', 'accountno', 'accountnumber', 'accno', 'acct', 'nuban'],
  accountName: ['acctname', 'accountname', 'customername', 'name', 'holdername', 'accountholder'],
  bankCode: ['bankcode', 'code'],
  bankName: ['bankname', 'bank'],
  bvn: ['bvn', 'bankverificationnumber'],
  nin: ['nin', 'nationalid', 'nationalidentitynumber'],
  tin: ['tin', 'taxid', 'taxidentificationnumber'],
  rcNumber: ['rc', 'rcnumber', 'cac', 'cacnumber'],
  phoneNumber: ['phone', 'phonenumber', 'msisdn', 'mobile', 'gsm'],
  customerEmail: ['email', 'customeremail', 'emailaddress'],
  customerAddress: ['address', 'customeraddress', 'residentialaddress'],
  transactionDate: ['transactiondate', 'txndate', 'date', 'valuedate', 'postingdate'],
  periodLabel: ['period', 'periodlabel', 'reportingperiod', 'quarter', 'periodquarter'],
  totalInflow: ['inflow', 'totalinflow', 'credit', 'totalcredit', 'creditturnover', 'deposits'],
  totalOutflow: ['outflow', 'totaloutflow', 'debit', 'totaldebit', 'debitturnover', 'withdrawals'],
  openingBalance: ['openingbalance', 'openbal', 'obalance'],
  closingBalance: ['closingbalance', 'closebal', 'cbalance', 'balance'],
  transactionCount: ['transactioncount', 'txncount', 'count', 'numtransactions'],
  walletId: ['walletid', 'wallet'],
  merchantId: ['merchantid', 'merchant'],
  sector: ['sector', 'economicsector'],
  businessType: ['businesstype', 'natureofbusiness'],
  customerType: ['customertype', 'accounttype', 'type'],
  currency: ['currency', 'ccy'],
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

export function heuristicMapping(headers: string[], schema: SchemaTemplate): ColumnMapping[] {
  const fieldByAlias = new Map<string, string>();
  for (const col of schema.columns) fieldByAlias.set(norm(col.name), col.name);
  for (const [field, aliases] of Object.entries(ALIASES)) {
    if (!schema.columns.some((c) => c.name === field)) continue;
    for (const a of aliases) if (!fieldByAlias.has(a)) fieldByAlias.set(a, field);
  }
  return headers.map((h) => ({ source: h, target: fieldByAlias.get(norm(h)) ?? '', confidence: fieldByAlias.has(norm(h)) ? 0.6 : 0 }));
}

/**
 * Merge an LLM mapping with the schema: keep model targets that are valid
 * canonical names; fill gaps with the heuristic. One entry per incoming header.
 */
export function resolveMapping(headers: string[], schema: SchemaTemplate, llm: ColumnMapping[]): ColumnMapping[] {
  const valid = new Set(schema.columns.map((c) => c.name));
  const bySource = new Map(llm.map((m) => [m.source, m]));
  const heuristic = new Map(heuristicMapping(headers, schema).map((m) => [m.source, m]));
  return headers.map((h) => {
    const m = bySource.get(h);
    if (m && valid.has(m.target)) return { source: h, target: m.target, confidence: m.confidence ?? 0.9 };
    return heuristic.get(h) ?? { source: h, target: '', confidence: 0 };
  });
}

/* ─── Deterministic apply ───────────────────────────────────────────────────── */

function normalizeValue(raw: string, field: FieldDef): string {
  const v = (raw ?? '').trim();
  if (!v) return '';
  if (field.name === 'periodLabel') return normalizePeriodLabel(v) ?? v;
  if (field.validation?.format === 'date') return parseFlexibleDate(v) ?? v;
  if (field.type === 'decimal') return v.replace(/[₦$€£,\s]/g, '');
  if (field.type === 'integer') return v.replace(/[,\s]/g, '');
  return v;
}

/**
 * Apply the mapping to produce canonical rows. Corrected headers = every schema
 * column that is required OR has a mapped source (schema order preserved), so a
 * required-but-unmapped field appears as an empty column and is flagged per-row
 * (rather than the whole file being rejected for a "missing column").
 */
export function applyMapping(
  headers: string[],
  rows: Record<string, string>[],
  mapping: ColumnMapping[],
  schema: SchemaTemplate,
): { headers: string[]; rows: Record<string, string>[] } {
  const sourceFor = new Map<string, string>(); // canonical field -> source header
  for (const m of mapping) if (m.target && !sourceFor.has(m.target)) sourceFor.set(m.target, m.source);

  const outCols = schema.columns.filter((c) => c.required || sourceFor.has(c.name));
  const outHeaders = outCols.map((c) => c.name);
  const outRows = rows.map((r) => {
    const o: Record<string, string> = {};
    for (const col of outCols) {
      const src = sourceFor.get(col.name);
      o[col.name] = src ? normalizeValue(r[src] ?? '', col) : '';
    }
    return o;
  });
  return { headers: outHeaders, rows: outRows };
}

/* ─── Truthful re-validation (mirrors the real ingestion Phase A) ──────────── */

export function validateCorrected(
  rows: Record<string, string>[],
  schema: SchemaTemplate,
  providerType: string,
): { accept: number; reject: number; issues: RowIssue[] } {
  let accept = 0;
  let reject = 0;
  const issues: RowIssue[] = [];
  rows.forEach((row, i) => {
    const res = validateRow(row, schema);
    const integrity = validateIngestionRow(row, providerType);
    const errors = [...res.errors, ...integrity];
    if (errors.length === 0) {
      accept++;
    } else {
      reject++;
      if (issues.length < MAX_ISSUES) issues.push({ row: i + 1, errors });
    }
  });
  return { accept, reject, issues };
}

/** Before→after sample (real values — provider is reviewing their own upload). */
export function previewRows(
  origHeaders: string[],
  origRows: Record<string, string>[],
  corrected: { headers: string[]; rows: Record<string, string>[] },
): PreviewRow[] {
  const out: PreviewRow[] = [];
  for (let i = 0; i < Math.min(MAX_PREVIEW, origRows.length); i++) {
    out.push({ before: origRows[i], after: corrected.rows[i] });
  }
  return out;
}

/** Serialize canonical rows back to CSV for the real upload pipeline. */
export function toCsv(headers: string[], rows: Record<string, string>[]): string {
  const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const lines = [headers.join(',')];
  for (const r of rows) lines.push(headers.map((h) => esc(r[h] ?? '')).join(','));
  return lines.join('\n');
}
