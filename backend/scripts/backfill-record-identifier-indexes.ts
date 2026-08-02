/**
 * Backfill data_records.bvnIndex / ninIndex — and optionally encrypt any
 * identifier still sitting in the clear.
 *
 * Why this exists: the bulk importers wrote the raw BVN / account number / phone
 * straight onto the record while correctly encrypting the taxpayer's copy, so
 * historic rows hold plaintext PII and no blind index. The account-linkage
 * report groups on the blind index (bvn/nin are AES-GCM with a random IV, so
 * equal values do NOT produce equal ciphertext and cannot be grouped in SQL), so
 * without this backfill the report returns nothing at all.
 *
 * Two passes, separable because they are independent — the index is derived from
 * the PLAINTEXT value, so encrypting afterwards never invalidates it:
 *   --indexes-only   write bvnIndex/ninIndex, touch nothing else. Cheap, and
 *                    enough to make the linkage report work.
 *   (default)        also rewrite any plaintext bvn/nin/accountNumber/phone as
 *                    ciphertext.
 *   --dry-run        report what would change, write nothing.
 *
 * Bulk-updates in batches via a single UPDATE ... FROM (VALUES …) per batch;
 * row-by-row updates are far too slow at the ~600k-row scale this runs at.
 * Safe to re-run: rows that already carry their indexes are skipped by the
 * cursor query, so an interrupted run resumes where it stopped.
 *
 *   npx ts-node scripts/backfill-record-identifier-indexes.ts --indexes-only
 */
// MUST come first. ts-node does not load .env the way the Nest bootstrap does,
// so without this the script silently falls back to the DEV keys derived from
// JWT_SECRET — writing blind indexes and ciphertext that the running app,
// which uses PII_INDEX_KEY / PII_ENC_KEY, cannot match or decrypt.
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { CryptoService } from '../src/common/services/crypto.service';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const DRY = process.argv.includes('--dry-run');
const INDEXES_ONLY = process.argv.includes('--indexes-only');
const BATCH = 4000;

/**
 * A row still needs work when an identifier has no blind index yet, or — unless
 * --indexes-only — when a value is still stored in the clear (`v1.`/`v2.` is the
 * CryptoService ciphertext prefix, so NOT LIKE 'v_.%' means plaintext).
 */
const PENDING_SQL = INDEXES_ONLY
  ? `((bvn IS NOT NULL AND "bvnIndex" IS NULL) OR (nin IS NOT NULL AND "ninIndex" IS NULL))`
  : `((bvn IS NOT NULL AND ("bvnIndex" IS NULL OR bvn NOT LIKE 'v_.%'))
     OR (nin IS NOT NULL AND ("ninIndex" IS NULL OR nin NOT LIKE 'v_.%'))
     OR ("accountNumber" IS NOT NULL AND ("accountIndex" IS NULL OR "accountNumber" NOT LIKE 'v_.%'))
     OR ("phoneNumber" IS NOT NULL AND "phoneNumber" NOT LIKE 'v_.%'))`;

/** Already an AES-GCM payload written by CryptoService? */
const isCiphertext = (v: string | null) => !!v && (v.startsWith('v1.') || v.startsWith('v2.'));

async function main() {
  const crypto = new CryptoService();
  await crypto.onModuleInit();

  const [{ count }] = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
    `SELECT COUNT(*)::bigint AS count FROM data_records WHERE ${PENDING_SQL}`,
  );
  const todo = Number(count);
  console.log(
    `${todo.toLocaleString()} record(s) need work.` +
    `${INDEXES_ONLY ? ' Indexes only — plaintext values will be left as-is.' : ' Plaintext values will also be encrypted.'}` +
    `${DRY ? ' DRY RUN — nothing will be written.' : ''}`,
  );
  if (todo === 0) { console.log('Nothing to do.'); return; }

  let cursor = '';
  let scanned = 0, indexed = 0, encrypted = 0;
  const started = Date.now();

  for (;;) {
    // Cursor by id so an interrupted run resumes; the WHERE also naturally skips
    // rows a previous run already completed.
    const rows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT id, bvn, nin, "accountNumber", "phoneNumber", "bvnIndex", "ninIndex", "accountIndex"
         FROM data_records
        WHERE id > $1
          AND ${PENDING_SQL}
        ORDER BY id
        LIMIT ${BATCH}`,
      cursor,
    );
    if (!rows.length) break;
    cursor = rows[rows.length - 1].id;

    const updates: { id: string; cols: Record<string, string> }[] = [];
    for (const r of rows) {
      scanned++;
      const cols: Record<string, string> = {};

      for (const [col, idxCol] of [['bvn', 'bvnIndex'], ['nin', 'ninIndex'], ['accountNumber', 'accountIndex']] as const) {
        const stored = r[col] as string | null;
        if (!stored) continue;
        const plain = crypto.decrypt(stored);
        if (!plain) continue;
        if (!r[idxCol]) { cols[idxCol] = crypto.blindIndex(plain)!; indexed++; }
        if (!INDEXES_ONLY && !isCiphertext(stored)) { cols[col] = crypto.encrypt(plain)!; encrypted++; }
      }
      if (!INDEXES_ONLY && r.phoneNumber && !isCiphertext(r.phoneNumber)) {
        const plain = crypto.decrypt(r.phoneNumber);
        if (plain) { cols.phoneNumber = crypto.encrypt(plain)!; encrypted++; }
      }
      if (Object.keys(cols).length) updates.push({ id: r.id, cols });
    }

    if (updates.length && !DRY) await bulkUpdate(updates);

    const rate = Math.round(scanned / ((Date.now() - started) / 1000));
    console.log(`  …${scanned.toLocaleString()}/${todo.toLocaleString()} · ${indexed.toLocaleString()} index(es)` +
      `${INDEXES_ONLY ? '' : ` · ${encrypted.toLocaleString()} encrypted`} · ${rate}/s`);
  }

  console.log(`\nDone in ${Math.round((Date.now() - started) / 1000)}s. Scanned ${scanned.toLocaleString()}; ` +
    `wrote ${indexed.toLocaleString()} blind index(es)` +
    `${INDEXES_ONLY ? '' : `; encrypted ${encrypted.toLocaleString()} previously-plaintext value(s)`}.`);
  if (DRY) console.log('DRY RUN — no changes were persisted.');
  if (INDEXES_ONLY) {
    console.log('NOTE: plaintext identifiers were left untouched. Re-run without --indexes-only to encrypt them.');
  }
}

/**
 * One UPDATE for the whole batch. Every value is bound as a parameter (never
 * interpolated), and each column is written with COALESCE so a row that only
 * needs one column keeps the rest untouched.
 */
async function bulkUpdate(updates: { id: string; cols: Record<string, string> }[]) {
  // Only the columns this batch actually changes. Naming all seven made every
  // UPDATE rewrite (and re-index) columns it had no work for — on a table with
  // six indexes that dominated the runtime.
  const present = new Set<string>();
  for (const u of updates) for (const k of Object.keys(u.cols)) present.add(k);
  const COLS = (['bvnIndex', 'ninIndex', 'accountIndex', 'bvn', 'nin', 'accountNumber', 'phoneNumber'] as const)
    .filter((c) => present.has(c));
  if (!COLS.length) return;

  // One array parameter PER COLUMN, unnested server-side — not one placeholder
  // per cell. A VALUES list of N tuples costs 8·N bind parameters, which caps
  // the batch at a few hundred rows (Prisma trips P2029 past ~32k binds) and
  // makes Postgres re-plan a differently-shaped statement every time. With
  // UNNEST the statement shape is constant and the bind count is fixed at
  // COLS.length + 1, so batches can be thousands of rows.
  const ids = updates.map((u) => u.id);
  const arrays = COLS.map((c) => updates.map((u) => u.cols[c] ?? null));
  const setClause = COLS.map((c) => `"${c}" = COALESCE(v."${c}", d."${c}")`).join(', ');
  const casts = COLS.map((_, i) => `$${i + 2}::text[]`).join(', ');

  await prisma.$executeRawUnsafe(
    `UPDATE data_records d SET ${setClause}
       FROM (SELECT * FROM unnest($1::text[], ${casts})
                       AS t(id, ${COLS.map((c) => `"${c}"`).join(', ')})) v
      WHERE d.id = v.id`,
    ids,
    ...arrays,
  );
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
