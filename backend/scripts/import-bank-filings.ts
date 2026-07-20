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
import * as readline from 'readline';
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

/** Stream the JSONL file line-by-line, invoking cb per parsed record.
 * Avoids loading the whole 1GB+ file into a single string (ERR_STRING_TOO_LONG). */
async function forEachRecord(file: string, cb: (r: any) => Promise<void> | void): Promise<number> {
  let n = 0;
  const rl = readline.createInterface({ input: fs.createReadStream(file, { encoding: 'utf-8' }), crlfDelay: Infinity });
  for await (const line of rl) {
    const s = line.trim();
    if (!s) continue;
    let r: any;
    try { r = JSON.parse(s); } catch { continue; }
    await cb(r);
    n++;
  }
  return n;
}

async function main() {
  console.log(`=== FinData ← bank-filing import ${DRY_RUN ? '(DRY RUN — no writes)' : ''} ===`);
  if (!fs.existsSync(RECORDS)) throw new Error(`records file not found: ${RECORDS}`);

  // Resolve provider name via the reconciliation map, then to a live provider id.
  const pmap = JSON.parse(fs.readFileSync(PROVIDER_MAP, 'utf-8')).map as Record<string, string>;
  const providers = await prisma.dataProvider.findMany({ select: { id: true, name: true, providerType: true } });
  const byName = new Map(providers.map((p) => [p.name.trim().toUpperCase(), p]));
  const resolve = (raw: string) => {
    const mapped = pmap[raw] || raw;
    return byName.get(mapped.trim().toUpperCase());
  };

  // PASS 1 (streaming): validate providers + gather per-provider counts + distinct
  // (provider, quarter) pairs. Fail LOUDLY if any provider can't be resolved.
  const missing = new Set<string>();
  const perProv: Record<string, { txn: number; open: number }> = {};
  const pairs = new Set<string>();  // "providerId|quarter"
  let scanned = 0;
  await forEachRecord(RECORDS, (r) => {
    scanned++;
    const p = resolve(r.provider);
    if (!p) { missing.add(`${r.provider}  ->  ${pmap[r.provider] || '(unmapped)'}`); return; }
    perProv[r.provider] ??= { txn: 0, open: 0 };
    if (r.recordKind === 'ACCOUNT_OPENED') perProv[r.provider].open++; else perProv[r.provider].txn++;
    pairs.add(`${p.id}|${r.quarter}`);
  });
  console.log(`Scanned ${scanned} records.`);
  if (missing.size) {
    console.error(`\n❌ ${missing.size} provider(s) not found in findata data_providers:`);
    for (const m of missing) console.error('   - ' + m);
    console.error('\nFix provider-map.json (or create the providers) and re-run. Nothing was imported.');
    process.exit(1);
  }
  console.log('✓ all providers resolve to live data_providers');

  if (DRY_RUN) {
    console.log('\nWould import (per provider  txn / account-opened):');
    for (const [k, v] of Object.entries(perProv).sort()) console.log(`   ${k.padEnd(26)}  ${String(v.txn).padStart(8)} / ${v.open}`);
    console.log(`\n${pairs.size} (provider, quarter) submissions.`);
    console.log('DRY RUN complete — no writes performed.');
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
  for (const pair of pairs) { const [pid, quarter] = pair.split('|'); await getSubmission(pid, quarter); }
  console.log(`Pre-created ${subCache.size} submissions.`);

  // PASS 2 (streaming): import in batches of BATCH, running each batch concurrently.
  const BATCH = 200;
  let batch: any[] = [];
  let done = 0;
  const flush = async () => {
    const b = batch; batch = [];
    await Promise.all(b.map(async (r: any) => {
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
    done += b.length;
    process.stdout.write(`\r  Records: ${done}/${scanned}…`);
  };

  await forEachRecord(RECORDS, async (r) => {
    batch.push(r);
    if (batch.length >= BATCH) await flush();
  });
  if (batch.length) await flush();

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
