/**
 * Import the Kano bank-filing archive (2025 Q1 – 2026 Q2) into findata.
 *
 * Reads a normalized JSONL (produced offline by the spec-driven normalizer) where
 * each line already carries: provider, quarter (YYYY-Qn), recordKind, accountName,
 * accountNumber, bvn/tin/nin, phone, email, address, amount, transactionDate,
 * customerType, rcNumber, currency, txntype (txnType), desc (description), flags.
 *
 * recordKind semantics (the whole point of this importer):
 *   TRANSACTION    -> a real money inflow; totalInflow = amount, transactionCount = 1.
 *   ACCOUNT_OPENED -> a new-account listing, NO money; totalInflow = 0, count = 0.
 *                     Stored + searchable for the identity graph, but never counted
 *                     toward the ₦50m/₦250m threshold or transaction totals.
 *
 * Providers must already exist (matched via provider-map.json -> exact DB name).
 * Run  scripts/check-providers.ts  first to validate the map against the live table.
 *
 * Usage:
 *   npx tsx scripts/import-bank-filings.ts --dry-run          # counts only, no writes
 *   npx tsx scripts/import-bank-filings.ts                    # real import
 *   RECORDS_FILE=scripts/import_records.jsonl PROVIDER_MAP=scripts/provider-map.json \
 *     npx tsx scripts/import-bank-filings.ts
 */
import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient, ProviderType, TaxpayerType, TaxpayerStatus, SubmissionStatus } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { CryptoService } from '../src/common/services/crypto.service';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
const crypto = new CryptoService();
(crypto as any).onModuleInit();

const RECORDS = process.env.RECORDS_FILE || path.join(__dirname, 'import_records.jsonl');
const PROVIDER_MAP = process.env.PROVIDER_MAP || path.join(__dirname, 'provider-map.json');
const DRY_RUN = process.argv.includes('--dry-run');

let encErrors = 0, taxpayersCreated = 0, taxpayersReused = 0;
let recordsCreated = 0, recordsSkipped = 0, txnCount = 0, openCount = 0;

function normaliseName(raw: string): { firstName: string; lastName: string; middleName?: string } {
  const parts = (raw || 'UNKNOWN').trim().split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  if (parts.length === 2) return { firstName: parts[0], lastName: parts[1] };
  return { firstName: parts[0], middleName: parts[1], lastName: parts.slice(2).join(' ') };
}

function isCorporate(rec: any): boolean {
  const t = (rec.customerType || '').toUpperCase();
  return t === 'CORPORATE' || (!!rec.rcNumber && rec.rcNumber.toUpperCase() !== 'N/A');
}

function toNum(v: any): number {
  const n = Number(String(v ?? '').replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : 0;
}

async function encryptPii(value: string | null | undefined): Promise<{ enc: string; idx: string } | null> {
  const v = (value || '').trim();
  if (!v || v.toUpperCase() === 'NO TAX ID' || v === '0' || v.toUpperCase() === 'N/A') return null;
  try {
    return { enc: crypto.encrypt(v), idx: crypto.blindIndex(v) };
  } catch {
    encErrors++;
    return null;
  }
}

async function findOrCreateTaxpayer(rec: any): Promise<string | null> {
  const bvnPii = await encryptPii(rec.bvn);
  const tinPii = await encryptPii(rec.tin);
  const ninPii = await encryptPii(rec.nin);
  const corp = isCorporate(rec);

  if (bvnPii) { const f = await prisma.taxpayer.findUnique({ where: { bvnIndex: bvnPii.idx } }); if (f) { taxpayersReused++; return f.id; } }
  if (tinPii) { const f = await prisma.taxpayer.findUnique({ where: { tinIndex: tinPii.idx } }); if (f) { taxpayersReused++; return f.id; } }
  if (ninPii) { const f = await prisma.taxpayer.findUnique({ where: { ninIndex: ninPii.idx } }); if (f) { taxpayersReused++; return f.id; } }

  const { firstName, lastName, middleName } = normaliseName(rec.accountName);
  try {
    const tp = await prisma.taxpayer.create({
      data: {
        type: corp ? TaxpayerType.CORPORATE : TaxpayerType.INDIVIDUAL,
        status: TaxpayerStatus.ACTIVE,
        firstName: corp ? undefined : firstName,
        lastName: corp ? undefined : lastName,
        middleName: corp ? undefined : middleName,
        businessName: corp ? rec.accountName : undefined,
        cacRcNumber: rec.rcNumber && rec.rcNumber.toUpperCase() !== 'N/A' ? rec.rcNumber : undefined,
        phone: rec.phone || undefined,
        email: rec.email || undefined,
        address: rec.address || undefined,
        stateOfResidence: 'Kano',
        ...(bvnPii ? { bvnEnc: bvnPii.enc, bvnIndex: bvnPii.idx } : {}),
        ...(ninPii ? { ninEnc: ninPii.enc, ninIndex: ninPii.idx } : {}),
        ...(tinPii ? { tinEnc: tinPii.enc, tinIndex: tinPii.idx } : {}),
      },
    });
    taxpayersCreated++;
    return tp.id;
  } catch (e: any) {
    if (e.code === 'P2002') {
      if (bvnPii) { const f = await prisma.taxpayer.findUnique({ where: { bvnIndex: bvnPii.idx } }); if (f) { taxpayersReused++; return f.id; } }
      if (tinPii) { const f = await prisma.taxpayer.findUnique({ where: { tinIndex: tinPii.idx } }); if (f) { taxpayersReused++; return f.id; } }
      if (ninPii) { const f = await prisma.taxpayer.findUnique({ where: { ninIndex: ninPii.idx } }); if (f) { taxpayersReused++; return f.id; } }
    }
    return null;
  }
}

async function main() {
  console.log(`=== FinData ← bank-filing import ${DRY_RUN ? '(DRY RUN — no writes)' : ''} ===`);
  if (!fs.existsSync(RECORDS)) throw new Error(`records file not found: ${RECORDS}`);
  const rows = fs.readFileSync(RECORDS, 'utf-8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
  console.log(`Records to import: ${rows.length}`);

  // Resolve provider name via the reconciliation map, then to a live provider id.
  const pmap = JSON.parse(fs.readFileSync(PROVIDER_MAP, 'utf-8')).map as Record<string, string>;
  const providers = await prisma.dataProvider.findMany({ select: { id: true, name: true, providerType: true } });
  const byName = new Map(providers.map((p) => [p.name.trim().toUpperCase(), p]));
  const resolve = (raw: string) => {
    const mapped = pmap[raw] || raw;
    return byName.get(mapped.trim().toUpperCase());
  };

  // Fail LOUDLY if any provider can't be resolved — never silently drop a bank.
  const missing = new Set<string>();
  for (const r of rows) if (!resolve(r.provider)) missing.add(`${r.provider}  ->  ${pmap[r.provider] || '(unmapped)'}`);
  if (missing.size) {
    console.error(`\n❌ ${missing.size} provider(s) not found in findata data_providers:`);
    for (const m of missing) console.error('   - ' + m);
    console.error('\nFix provider-map.json (or create the providers) and re-run. Nothing was imported.');
    process.exit(1);
  }
  console.log('✓ all providers resolve to live data_providers');

  if (DRY_RUN) {
    const perProv: Record<string, { txn: number; open: number }> = {};
    for (const r of rows) {
      const k = r.provider; perProv[k] ??= { txn: 0, open: 0 };
      if (r.recordKind === 'ACCOUNT_OPENED') perProv[k].open++; else perProv[k].txn++;
    }
    console.log('\nWould import (per provider  txn / account-opened):');
    for (const [k, v] of Object.entries(perProv).sort()) console.log(`   ${k.padEnd(26)}  ${String(v.txn).padStart(8)} / ${v.open}`);
    console.log('\nDRY RUN complete — no writes performed.');
    return;
  }

  // One submission per (provider, quarter). Pre-create SERIALLY (avoids the
  // concurrent find-then-create duplicate race) before the parallel record loop.
  const subCache = new Map<string, string>();
  async function getSubmission(providerId: string, quarter: string): Promise<string> {
    const key = `${providerId}:${quarter}`;
    if (subCache.has(key)) return subCache.get(key)!;
    const existing = await prisma.dataSubmission.findFirst({ where: { providerId, periodLabel: quarter }, select: { id: true } });
    if (existing) { subCache.set(key, existing.id); return existing.id; }
    const sub = await prisma.dataSubmission.create({
      data: { providerId, periodLabel: quarter, periodYear: Number(quarter.slice(0, 4)), status: SubmissionStatus.ACCEPTED, recordCount: 0 },
    });
    subCache.set(key, sub.id);
    return sub.id;
  }
  for (const r of rows) { const p = resolve(r.provider)!; await getSubmission(p.id, r.quarter); }

  const BATCH = 200;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    await Promise.all(batch.map(async (r: any) => {
      try {
        const p = resolve(r.provider)!;
        const submissionId = await getSubmission(p.id, r.quarter);
        const taxpayerId = await findOrCreateTaxpayer(r);
        const acctIdx = r.accountNumber ? crypto.blindIndex(String(r.accountNumber).trim()) : undefined;
        const isOpen = r.recordKind === 'ACCOUNT_OPENED';
        await prisma.dataRecord.create({
          data: {
            submissionId,
            providerId: p.id,
            providerType: p.providerType as ProviderType,
            taxpayerId: taxpayerId ?? undefined,
            accountNumber: r.accountNumber || undefined,
            accountName: r.accountName || undefined,
            bvn: r.bvn || undefined,
            phoneNumber: r.phone || undefined,
            periodLabel: r.quarter,
            periodYear: Number(r.quarter.slice(0, 4)),
            matchMethod: taxpayerId ? (r.bvn ? 'BVN' : r.tin ? 'TIN' : 'NAME') : 'UNMATCHED',
            matchConfidence: taxpayerId ? 0.9 : 0.0,
            accountIndex: acctIdx ?? undefined,
            // recordKind drives money: ACCOUNT_OPENED contributes ₦0 and 0 count,
            // so it can never push a taxpayer over the reporting threshold nor
            // inflate transaction totals (SUM-safe). It stays fully searchable.
            totalInflow: isOpen ? 0 : toNum(r.amount),
            transactionCount: isOpen ? 0 : 1,
            payload: {
              source: 'bank-filing',
              recordKind: isOpen ? 'ACCOUNT_OPENED' : 'TRANSACTION',
              transactionDate: r.transactionDate || null,
              transactionType: r.txntype || null,
              description: r.desc || null,
              currency: r.currency || null,
              customerType: r.customerType || null,
              rcNumber: r.rcNumber || null,
              sourceFile: r.sourceFile || null,
              flags: r.flags && r.flags.length ? r.flags : undefined,
            },
          },
        });
        recordsCreated++;
        if (isOpen) openCount++; else txnCount++;
      } catch (e: any) {
        if (e.code !== 'P2002') console.error(`row error: ${e.message?.slice(0, 90)}`);
        recordsSkipped++;
      }
    }));
    process.stdout.write(`\r  Records: ${Math.min(i + BATCH, rows.length)}/${rows.length}…`);
  }

  // Backfill submission counters (transaction rows only — account-openings don't count).
  let finalized = 0;
  for (const submissionId of subCache.values()) {
    const total = await prisma.dataRecord.count({ where: { submissionId } });
    const txn = await prisma.dataRecord.count({ where: { submissionId, payload: { path: ['recordKind'], equals: 'TRANSACTION' } } });
    await prisma.dataSubmission.update({ where: { id: submissionId }, data: { recordCount: total, acceptedCount: txn, rejectedCount: 0 } });
    finalized++;
  }

  console.log(`\nTaxpayers: ${taxpayersCreated} created, ${taxpayersReused} reused`);
  console.log(`Records:   ${recordsCreated} created (${txnCount} txn, ${openCount} account-opened), ${recordsSkipped} skipped`);
  console.log(`Submissions finalized: ${finalized}`);
  if (encErrors) console.warn(`Encryption errors (non-fatal): ${encErrors}`);
  const totals = await Promise.all([prisma.dataRecord.count(), prisma.dataSubmission.count(), prisma.taxpayer.count()]);
  console.log(`\nDataRecords: ${totals[0]}  Submissions: ${totals[1]}  Taxpayers: ${totals[2]}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); await pool.end(); });
