import { Prisma } from '@prisma/client';

/**
 * Default provider-type schemas. Each describes which CSV columns are required/optional
 * for a given provider type, and how to extract DataRecord fields from them.
 */

export interface FieldDef {
  name: string;
  required: boolean;
  type: 'string' | 'decimal' | 'integer';
  validation?: { length?: number; min?: number; max?: number; pattern?: string };
}

export interface SchemaTemplate {
  providerType: string;
  columns: FieldDef[];
}

export const DEFAULT_SCHEMAS: Record<string, SchemaTemplate> = {
  BANK: {
    providerType: 'BANK',
    columns: [
      { name: 'bankCode', required: true, type: 'string' },
      { name: 'bankName', required: true, type: 'string' },
      { name: 'accountNumber', required: true, type: 'string', validation: { length: 10 } },
      { name: 'bvn', required: true, type: 'string', validation: { length: 11 } },
      { name: 'nin', required: false, type: 'string' },
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
      { name: 'nin', required: false, type: 'string' },
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
      { name: 'nin', required: false, type: 'string' },
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
  OTHER: {
    providerType: 'OTHER',
    columns: [
      { name: 'accountName', required: true, type: 'string' },
      { name: 'periodLabel', required: true, type: 'string' },
      { name: 'totalInflow', required: false, type: 'decimal' },
    ],
  },
};

export function parseCsvText(csvText: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = csvText.replace(/^﻿/, '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) return { headers: [], rows: [] };
  const headers = lines[0].split(',').map(h => h.trim());
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => { row[h] = values[idx] || ''; });
    rows.push(row);
  }
  return { headers, rows };
}

export function validateRow(
  row: Record<string, string>,
  schema: SchemaTemplate,
): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  for (const col of schema.columns) {
    const raw = row[col.name];
    const present = raw !== undefined && raw !== '';
    if (col.required && !present) {
      errors.push(`${col.name} required`);
      continue;
    }
    if (!present) continue;

    if (col.type === 'decimal' || col.type === 'integer') {
      const n = Number(raw);
      if (isNaN(n)) {
        errors.push(`${col.name} must be numeric`);
        continue;
      }
      if (col.validation?.min != null && n < col.validation.min) {
        errors.push(`${col.name} below min`);
      }
      if (col.validation?.max != null && n > col.validation.max) {
        errors.push(`${col.name} above max`);
      }
    }
    if (col.type === 'string' && col.validation?.length != null) {
      if (raw.replace(/\D/g, '').length !== col.validation.length && /^\d+$/.test(raw.replace(/\D/g, ''))) {
        // require exact length only when value is numeric (like BVN/NUBAN)
        if (raw.length !== col.validation.length) {
          errors.push(`${col.name} must be ${col.validation.length} chars`);
        }
      }
    }
  }
  return { ok: errors.length === 0, errors };
}

export function parsePeriod(label: string): { year: number; quarter?: number; month?: number } | null {
  // YYYY-Qn
  const qm = label.match(/^(\d{4})-Q([1-4])$/);
  if (qm) return { year: parseInt(qm[1], 10), quarter: parseInt(qm[2], 10) };
  // YYYY-MM
  const mm = label.match(/^(\d{4})-(0[1-9]|1[0-2])$/);
  if (mm) return { year: parseInt(mm[1], 10), month: parseInt(mm[2], 10) };
  // YYYY
  const ym = label.match(/^(\d{4})$/);
  if (ym) return { year: parseInt(ym[1], 10) };
  return null;
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
