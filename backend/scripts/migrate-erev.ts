/**
 * One-shot migration: erev_staging (MySQL) → BIZDATA PostgreSQL
 *
 * Maps:
 *   kirs_institutions        → DataProvider
 *   kirs_transaction_records → Taxpayer (find-or-create by BVN/TIN/NIN) + DataRecord
 *
 * Preserves: existing Tenant, User (super admin), and seeded lookup data.
 * Skips:     markets, parks, shops, revenue_collections, users — different domain.
 *
 * PII (BVN, NIN, TIN) is AES-256-GCM encrypted + HMAC blind-indexed on write,
 * using the same keys as the running app (from .env / process.env).
 */

import 'dotenv/config';
import mysql from 'mysql2/promise';
import { PrismaClient, ProviderType, ProviderStatus, TaxpayerType, TaxpayerStatus, SubmissionStatus } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { CryptoService } from '../src/common/services/crypto.service';

const pool   = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
const crypto = new CryptoService();
(crypto as any).onModuleInit(); // load PII keys (NestJS lifecycle hook; must call manually outside DI)

// ─── MySQL connection ─────────────────────────────────────────────────────────
const db = mysql.createPool({
  host: '127.0.0.1',
  port: 3306,
  user: 'root',
  password: '',
  database: 'erev_staging',
  namedPlaceholders: true,
});

// ─── Period label ─────────────────────────────────────────────────────────────
// erev's transaction rows are a yearly bulk dataset, not a specific quarterly
// filing. DO NOT hardcode a future quarter (the original bug: everything landed on
// `${year}-Q4`, which shows as "filed" in compliance even before Q4 exists).
// Default to the quarter we're actually importing in; override with PERIOD_LABEL
// (e.g. "2026-Q2" or "2026" for annual) when the data belongs to a known period.
function defaultPeriodLabel(year: number): string {
  const envLabel = process.env.PERIOD_LABEL?.trim();
  if (envLabel) return envLabel;
  const now = new Date();
  // Only quarter-stamp if importing within the same year; otherwise use annual.
  if (now.getUTCFullYear() !== year) return `${year}`;
  const q = Math.floor(now.getUTCMonth() / 3) + 1;
  return `${year}-Q${q}`;
}

// Derive the TRUE reporting period for a record from its erev transaction_date.
// A dated row lands in its real quarter (YYYY-Qn); an undated row (transaction_date
// NULL — ~72% of the erev dataset) goes to an annual "undated" bucket for its year
// (YYYY), so it never falsely claims a specific quarter. Override the undated
// bucket with UNDATED_PERIOD_LABEL if desired.
function periodFromRow(row: any, fallbackYear: number): { label: string; year: number } {
  const raw = row.transaction_date;
  if (raw) {
    const d = raw instanceof Date ? raw : new Date(String(raw));
    if (!isNaN(d.getTime())) {
      const y = d.getUTCFullYear();
      const q = Math.floor(d.getUTCMonth() / 3) + 1;
      return { label: `${y}-Q${q}`, year: y };
    }
  }
  // Undated: annual bucket for the row's year (transaction_year, else created_at year).
  const y = row.transaction_year ?? fallbackYear;
  const undatedLabel = process.env.UNDATED_PERIOD_LABEL?.trim() || `${y}`;
  return { label: undatedLabel, year: y };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function toProviderType(type: string): ProviderType {
  switch (type) {
    case 'bank':          return ProviderType.BANK;
    case 'insurance':     return ProviderType.OTHER;   // no INSURANCE enum — use OTHER
    case 'microfinance':  return ProviderType.FINTECH;
    default:              return ProviderType.OTHER;
  }
}

function normaliseName(raw: string): { firstName: string; lastName: string; middleName?: string } {
  const parts = raw.trim().split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  if (parts.length === 2) return { firstName: parts[0], lastName: parts[1] };
  return { firstName: parts[0], middleName: parts[1], lastName: parts.slice(2).join(' ') };
}

function isCorporate(row: any): boolean {
  return row.customer_type === 'corporate' || !!row.rc_number;
}

let encErrors = 0;

async function encryptPii(value: string | null | undefined): Promise<{ enc: string; idx: string } | null> {
  if (!value || !value.trim()) return null;
  try {
    const enc = crypto.encrypt(value.trim());
    const idx = crypto.blindIndex(value.trim());
    return { enc, idx };
  } catch {
    encErrors++;
    return null;
  }
}

// ─── STEP 1: migrate institutions → DataProvider ──────────────────────────────
async function migrateProviders(): Promise<Map<number, string>> {
  const [rows]: any = await db.query('SELECT * FROM kirs_institutions ORDER BY id');
  const idMap = new Map<number, string>(); // mysql id → postgres uuid

  let created = 0;
  let skipped = 0;

  for (const row of rows) {
    // Deduplicate by providerCode
    const existing = await prisma.dataProvider.findUnique({ where: { providerCode: row.code } });
    if (existing) {
      idMap.set(row.id, existing.id);
      skipped++;
      continue;
    }

    const provider = await prisma.dataProvider.create({
      data: {
        providerCode:       row.code,
        name:               row.name,
        providerType:       toProviderType(row.type),
        contactEmail:       row.email ?? undefined,
        contactPhone:       row.phone ?? undefined,
        address:            row.address ?? undefined,
        status:             row.is_active ? ProviderStatus.ACTIVE : ProviderStatus.SUSPENDED,
        reportingFrequency: 'QUARTERLY',
      },
    });
    idMap.set(row.id, provider.id);
    created++;
  }

  console.log(`Providers: ${created} created, ${skipped} already existed`);
  return idMap;
}

// ─── STEP 1b: migrate institution logins → DataProviderUser ───────────────────
// erev's `kirs_institution_users` are the bank/insurer staff who log in to submit
// data — these map to BIZDATA's provider-portal logins (DataProviderUser). Their
// Laravel bcrypt hashes ($2y$) are cross-compatible with node bcrypt, so the
// passwords carry over unchanged. The other erev user table (`users`) is
// revenue-collection field agents — a different domain — and is intentionally skipped.
async function migrateProviderUsers(providerMap: Map<number, string>) {
  const [rows]: any = await db.query('SELECT * FROM kirs_institution_users ORDER BY id');
  let created = 0, skipped = 0, noProvider = 0;

  for (const row of rows) {
    const providerId = providerMap.get(row.kirs_institution_id);
    if (!providerId) { noProvider++; continue; }

    // Dedup by unique email — never overwrite an existing login.
    const existing = await prisma.dataProviderUser.findUnique({ where: { email: row.email } });
    if (existing) { skipped++; continue; }

    const { firstName, lastName } = normaliseName(row.name ?? 'Provider User');
    try {
      await prisma.dataProviderUser.create({
        data: {
          providerId,
          email:             row.email,
          passwordHash:      row.password,           // Laravel bcrypt ($2y$) works with node bcrypt
          firstName:         firstName || 'Provider',
          lastName:          lastName || 'User',
          isActive:          !!row.is_active,
          lastLoginAt:       row.last_login_at ? new Date(row.last_login_at) : undefined,
          passwordChangedAt: row.password_changed_at ? new Date(row.password_changed_at) : undefined,
          // role defaults to COMPLIANCE_OFFICER
        },
      });
      created++;
    } catch (e: any) {
      if (e.code === 'P2002') { skipped++; }        // unique email race
      else { console.error(`ProviderUser ${row.email} error: ${e.message?.slice(0, 80)}`); skipped++; }
    }
  }
  console.log(`Provider users: ${created} created, ${skipped} skipped, ${noProvider} had no mapped provider`);
}

// ─── STEP 2: migrate transaction records → Taxpayer + DataRecord ──────────────
async function migrateTransactions(providerMap: Map<number, string>) {
  const [rows]: any = await db.query(
    'SELECT * FROM kirs_transaction_records ORDER BY id',
  );

  let taxpayersCreated = 0;
  let taxpayersReused  = 0;
  let recordsCreated   = 0;
  let recordsSkipped   = 0;

  // One submission per (institution, PERIOD) so records group into their true
  // reporting quarter (or the undated annual bucket), not one blanket period.
  const submissionCache = new Map<string, string>(); // `${providerId}:${periodLabel}` → submissionId

  async function getOrCreateSubmission(providerId: string, periodLabel: string, year: number): Promise<string> {
    const key = `${providerId}:${periodLabel}`;
    if (submissionCache.has(key)) return submissionCache.get(key)!;

    // Idempotent across re-runs: the in-memory cache is empty on a fresh run, so
    // also look in the DB for an existing submission for this provider+period.
    // Without this, every re-import created a NEW submission per record batch,
    // producing hundreds of duplicate 1-record "uploads" for the same quarter.
    const existing = await prisma.dataSubmission.findFirst({
      where: { providerId, periodLabel },
      select: { id: true },
    });
    if (existing) {
      submissionCache.set(key, existing.id);
      return existing.id;
    }

    const sub = await prisma.dataSubmission.create({
      data: {
        providerId,
        periodLabel,
        periodYear:   year,
        status:       SubmissionStatus.ACCEPTED,
        recordCount:  0,
      },
    });
    submissionCache.set(key, sub.id);
    return sub.id;
  }

  async function findOrCreateTaxpayer(row: any): Promise<string | null> {
    const bvnPii  = await encryptPii(row.bvn);
    const ninPii  = await encryptPii(row.nin);
    const tinPii  = await encryptPii(row.tin);
    const corp    = isCorporate(row);

    // Lookup order: BVN (most reliable) → TIN → NIN
    if (bvnPii) {
      const found = await prisma.taxpayer.findUnique({ where: { bvnIndex: bvnPii.idx } });
      if (found) { taxpayersReused++; return found.id; }
    }
    if (tinPii) {
      const found = await prisma.taxpayer.findUnique({ where: { tinIndex: tinPii.idx } });
      if (found) { taxpayersReused++; return found.id; }
    }
    if (ninPii) {
      const found = await prisma.taxpayer.findUnique({ where: { ninIndex: ninPii.idx } });
      if (found) { taxpayersReused++; return found.id; }
    }

    // Create new taxpayer
    const { firstName, lastName, middleName } = normaliseName(row.account_name ?? 'UNKNOWN');
    try {
      const tp = await prisma.taxpayer.create({
        data: {
          type:              corp ? TaxpayerType.CORPORATE : TaxpayerType.INDIVIDUAL,
          status:            TaxpayerStatus.ACTIVE,
          firstName:         corp ? undefined : firstName,
          lastName:          corp ? undefined : lastName,
          middleName:        corp ? undefined : middleName,
          businessName:      corp ? row.account_name : undefined,
          cacRcNumber:       row.rc_number ?? undefined,
          phone:             row.phone ?? undefined,
          email:             row.email ?? undefined,
          address:           row.address ?? undefined,
          stateOfResidence:  'Kano',
          ...(bvnPii ? { bvnEnc: bvnPii.enc, bvnIndex: bvnPii.idx } : {}),
          ...(ninPii ? { ninEnc: ninPii.enc, ninIndex: ninPii.idx } : {}),
          ...(tinPii ? { tinEnc: tinPii.enc, tinIndex: tinPii.idx } : {}),
        },
      });
      taxpayersCreated++;
      return tp.id;
    } catch (e: any) {
      // Unique constraint race (duplicate BVN/TIN/NIN) — find the winner
      if (e.code === 'P2002') {
        if (bvnPii) {
          const found = await prisma.taxpayer.findUnique({ where: { bvnIndex: bvnPii.idx } });
          if (found) { taxpayersReused++; return found.id; }
        }
        if (tinPii) {
          const found = await prisma.taxpayer.findUnique({ where: { tinIndex: tinPii.idx } });
          if (found) { taxpayersReused++; return found.id; }
        }
      }
      return null;
    }
  }

  // Process in batches to avoid overwhelming the DB
  const BATCH = 200;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    await Promise.all(batch.map(async (row: any) => {
      try {
        const providerId = providerMap.get(row.kirs_institution_id);
        if (!providerId) { recordsSkipped++; return; }

        const fallbackYear = row.transaction_year ?? new Date(row.created_at).getFullYear();
        // True reporting period from the transaction date (undated → annual bucket).
        const period = periodFromRow(row, fallbackYear);
        const submissionId = await getOrCreateSubmission(providerId, period.label, period.year);
        const taxpayerId   = await findOrCreateTaxpayer(row);

        // Blind index for account number dedup
        const acctIdx = row.account_number
          ? crypto.blindIndex(row.account_number.trim())
          : undefined;

        await prisma.dataRecord.create({
          data: {
            submissionId,
            providerId,
            providerType:   ProviderType.BANK,
            taxpayerId:     taxpayerId ?? undefined,
            accountNumber:  row.account_number ?? undefined,
            accountName:    row.account_name ?? undefined,
            bvn:            row.bvn ?? undefined,
            nin:            row.nin ?? undefined,
            phoneNumber:    row.phone ?? undefined,
            periodLabel:    period.label,
            periodYear:     period.year,
            matchMethod:    taxpayerId ? (row.bvn ? 'BVN' : row.tin ? 'TIN' : 'NAME') : 'UNMATCHED',
            matchConfidence: taxpayerId ? 0.9 : 0.0,
            accountIndex:   acctIdx ?? undefined,
            totalInflow:    row.transaction_amount ?? 0,
            transactionCount: 1,
          },
        });
        recordsCreated++;
      } catch (e: any) {
        if (e.code !== 'P2002') {
          console.error(`Record ${row.id} error: ${e.message?.slice(0, 80)}`);
        }
        recordsSkipped++;
      }
    }));

    const done = Math.min(i + BATCH, rows.length);
    process.stdout.write(`\r  Records: ${done}/${rows.length} processed…`);
  }
  console.log(`\nTaxpayers: ${taxpayersCreated} created, ${taxpayersReused} reused`);
  console.log(`Records:   ${recordsCreated} created, ${recordsSkipped} skipped`);
  if (encErrors) console.warn(`Encryption errors (non-fatal): ${encErrors}`);

  // Finalize each submission's counters from the records that actually reference
  // it, so "Total uploads" and per-submission stats reflect reality (all rows
  // are ACCEPTED at import, so acceptedCount = recordCount, rejectedCount = 0).
  // Without this the submissions keep the recordCount:0 they were created with.
  let finalized = 0;
  for (const submissionId of submissionCache.values()) {
    const n = await prisma.dataRecord.count({ where: { submissionId } });
    await prisma.dataSubmission.update({
      where: { id: submissionId },
      data: { recordCount: n, acceptedCount: n, rejectedCount: 0 },
    });
    finalized++;
  }
  console.log(`Submissions finalized (counts backfilled): ${finalized}`);
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('=== BIZDATA ← erev migration ===');
  console.log('Preserving existing Users and Tenant.\n');

  console.log('Step 1: Providers…');
  const providerMap = await migrateProviders();

  console.log('Step 1b: Provider/institution logins…');
  await migrateProviderUsers(providerMap);

  console.log('Step 2: Taxpayers + transaction records…');
  await migrateTransactions(providerMap);

  console.log('\n=== Migration complete ===');
  const counts = await Promise.all([
    prisma.dataProvider.count(),
    prisma.dataProviderUser.count(),
    prisma.taxpayer.count(),
    prisma.dataRecord.count(),
  ]);
  console.log(`DataProviders:     ${counts[0]}`);
  console.log(`DataProviderUsers: ${counts[1]}`);
  console.log(`Taxpayers:         ${counts[2]}`);
  console.log(`DataRecords:       ${counts[3]}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); await pool.end(); await db.end(); });
