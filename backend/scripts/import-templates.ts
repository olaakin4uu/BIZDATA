/**
 * Import KIRS provider transactions from the ORIGINAL upload templates (parsed to
 * a normalized JSONL by parse_templates.py), replacing the lossy erev-derived
 * data. Each row already carries a real transactionDate → true quarter (Q1/Q2),
 * a resolved provider name, a cleaned BVN, and dedup already applied upstream.
 *
 * Reads:  scripts/staging_records.jsonl   (path overridable via STAGING_FILE)
 * Preserves existing Tenant + Users. Providers must already exist (matched by
 * name). Taxpayers are find-or-create by BVN/TIN/NIN (existing ones reused).
 *
 * Idempotency / replacement is the CALLER's job — run the delete step first, as
 * with the erev migration. This script only inserts.
 *
 * Run:  npx tsx scripts/import-templates.ts
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

const STAGING = process.env.STAGING_FILE || path.join(__dirname, 'staging_records.jsonl');

let encErrors = 0, taxpayersCreated = 0, taxpayersReused = 0, recordsCreated = 0, recordsSkipped = 0;

function normaliseName(raw: string): { firstName: string; lastName: string; middleName?: string } {
  const parts = (raw || 'UNKNOWN').trim().split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  if (parts.length === 2) return { firstName: parts[0], lastName: parts[1] };
  return { firstName: parts[0], middleName: parts[1], lastName: parts.slice(2).join(' ') };
}

// Legacy files say CORPORATE; the current return template says which CAC class
// (BUSINESS_NAME / PRIVATE_LIMITED / …). Anything that names a registered
// organisation — i.e. any known type other than INDIVIDUAL — is corporate here.
function isCorporate(rec: any): boolean {
  const t = (rec.customerType || '').toUpperCase();
  if (t === 'INDIVIDUAL') return false;
  return !!t || (!!rec.rcNumber && rec.rcNumber.toUpperCase() !== 'N/A');
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

  if (bvnPii) {
    const f = await prisma.taxpayer.findUnique({ where: { bvnIndex: bvnPii.idx } });
    if (f) { taxpayersReused++; return f.id; }
  }
  if (tinPii) {
    const f = await prisma.taxpayer.findUnique({ where: { tinIndex: tinPii.idx } });
    if (f) { taxpayersReused++; return f.id; }
  }
  if (ninPii) {
    const f = await prisma.taxpayer.findUnique({ where: { ninIndex: ninPii.idx } });
    if (f) { taxpayersReused++; return f.id; }
  }

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
    }
    return null;
  }
}

async function main() {
  console.log('=== FinData ← template import ===');
  if (!fs.existsSync(STAGING)) throw new Error(`staging file not found: ${STAGING}`);
  const lines = fs.readFileSync(STAGING, 'utf-8').split('\n').filter((l) => l.trim());
  const rows = lines.map((l) => JSON.parse(l));
  console.log(`Staged records: ${rows.length}`);

  // Resolve provider name → id (providers must already exist in findata).
  const providers = await prisma.dataProvider.findMany({ select: { id: true, name: true, providerType: true } });
  const provByName = new Map(providers.map((p) => [p.name.trim().toUpperCase(), p]));
  const resolveProvider = (name: string) => provByName.get((name || '').trim().toUpperCase());

  const missing = new Set<string>();
  for (const r of rows) if (!resolveProvider(r.provider)) missing.add(r.provider);
  if (missing.size) { console.error('❌ providers not found in findata:', [...missing]); process.exit(1); }

  // One submission per (provider, period). Pre-create SERIALLY (avoids the
  // concurrent find-then-create duplicate race) before the parallel record loop.
  const subCache = new Map<string, string>();
  async function getSubmission(providerId: string, periodLabel: string, year: number): Promise<string> {
    const key = `${providerId}:${periodLabel}`;
    if (subCache.has(key)) return subCache.get(key)!;
    const existing = await prisma.dataSubmission.findFirst({ where: { providerId, periodLabel }, select: { id: true } });
    if (existing) { subCache.set(key, existing.id); return existing.id; }
    const sub = await prisma.dataSubmission.create({
      data: { providerId, periodLabel, periodYear: year, status: SubmissionStatus.ACCEPTED, recordCount: 0 },
    });
    subCache.set(key, sub.id);
    return sub.id;
  }
  for (const r of rows) {
    const p = resolveProvider(r.provider)!;
    await getSubmission(p.id, r.quarter, Number(r.quarter.slice(0, 4)));
  }

  const BATCH = 200;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    await Promise.all(batch.map(async (r: any) => {
      try {
        const p = resolveProvider(r.provider)!;
        const submissionId = await getSubmission(p.id, r.quarter, Number(r.quarter.slice(0, 4)));
        const taxpayerId = await findOrCreateTaxpayer(r);
        const acctIdx = r.accountNumber ? crypto.blindIndex(String(r.accountNumber).trim()) : undefined;
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
            totalInflow: toNum(r.amount),
            transactionCount: 1,
            payload: {
              source: 'template',
              transactionDate: r.transactionDate,
              transactionType: r.txntype || null,
              description: r.desc || null,
              currency: r.currency || null,
              accountType: r.accountType || null,
              bvnRaw: r.bvn_raw || null,
            },
          },
        });
        recordsCreated++;
      } catch (e: any) {
        if (e.code !== 'P2002') console.error(`row error: ${e.message?.slice(0, 90)}`);
        recordsSkipped++;
      }
    }));
    process.stdout.write(`\r  Records: ${Math.min(i + BATCH, rows.length)}/${rows.length}…`);
  }

  // Backfill submission counters from the records that reference them.
  let finalized = 0;
  for (const submissionId of subCache.values()) {
    const n = await prisma.dataRecord.count({ where: { submissionId } });
    await prisma.dataSubmission.update({ where: { id: submissionId }, data: { recordCount: n, acceptedCount: n, rejectedCount: 0 } });
    finalized++;
  }

  console.log(`\nTaxpayers: ${taxpayersCreated} created, ${taxpayersReused} reused`);
  console.log(`Records:   ${recordsCreated} created, ${recordsSkipped} skipped`);
  console.log(`Submissions finalized: ${finalized}`);
  if (encErrors) console.warn(`Encryption errors (non-fatal): ${encErrors}`);
  const totals = await Promise.all([prisma.dataRecord.count(), prisma.dataSubmission.count(), prisma.taxpayer.count()]);
  console.log(`\nDataRecords: ${totals[0]}  Submissions: ${totals[1]}  Taxpayers: ${totals[2]}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); await pool.end(); });
