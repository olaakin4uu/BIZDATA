/**
 * Validate scripts/provider-map.json against the live data_providers table BEFORE
 * importing the bank-filing archive. Prints, for every provider in import_records.jsonl:
 *   ✓ resolves to an existing provider   OR   ✗ MISSING (must create or fix map).
 * Also lists the full live provider list so mismatched names can be corrected.
 *
 * Usage: npx tsx scripts/check-providers.ts
 */
import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const RECORDS = process.env.RECORDS_FILE || path.join(__dirname, 'import_records.jsonl');
const PROVIDER_MAP = process.env.PROVIDER_MAP || path.join(__dirname, 'provider-map.json');

async function main() {
  const pmap = JSON.parse(fs.readFileSync(PROVIDER_MAP, 'utf-8')).map as Record<string, string>;
  const providers = await prisma.dataProvider.findMany({ select: { name: true, providerType: true } });
  const live = new Map(providers.map((p) => [p.name.trim().toUpperCase(), p.name]));

  // distinct raw provider names in the import file
  const raw = new Set<string>();
  for (const l of fs.readFileSync(RECORDS, 'utf-8').split('\n')) {
    if (!l.trim()) continue;
    raw.add(JSON.parse(l).provider);
  }

  console.log('=== provider reconciliation ===');
  let ok = 0, missing = 0;
  for (const r of [...raw].sort()) {
    const mapped = pmap[r] || r;
    const hit = live.get(mapped.trim().toUpperCase());
    if (hit) { console.log(`  ✓ ${r.padEnd(26)} -> "${hit}"`); ok++; }
    else { console.log(`  ✗ ${r.padEnd(26)} -> "${mapped}"  NOT IN DB`); missing++; }
  }
  console.log(`\n${ok} resolve, ${missing} missing.`);

  console.log('\n=== live data_providers (' + providers.length + ') ===');
  for (const p of providers.sort((a, b) => a.name.localeCompare(b.name))) console.log(`   ${p.name}  [${p.providerType}]`);

  if (missing) { console.error('\nFix provider-map.json or create the missing providers before importing.'); process.exit(1); }
  console.log('\n✓ all providers resolve — safe to import.');
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(async () => { await prisma.$disconnect(); await pool.end(); });
