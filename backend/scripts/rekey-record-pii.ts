/**
 * One-off: re-key record PII that was written under the DEV fallback keys.
 *
 * How the rows got that way: a maintenance script run under ts-node does not
 * load .env, so CryptoService fell back to keys derived from JWT_SECRET — and
 * with .env absent, JWT_SECRET itself was undefined, so the derivation used the
 * literal default 'bizdata-dev-secret'. Those rows are tagged `v2.dev.` and the
 * running app, which loads PII_ENC_KEY / PII_INDEX_KEY from .env, cannot decrypt
 * them or match their blind indexes.
 *
 * This decrypts each affected value with the dev key, re-encrypts it under the
 * active real key, and recomputes the blind index with the real index key.
 * Idempotent: rows already under the real key carry a different key id and are
 * skipped by the WHERE clause.
 *
 *   DATABASE_URL=... npx ts-node scripts/rekey-record-pii.ts [--dry-run]
 */
import 'dotenv/config';
import { createDecipheriv, createHash } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { CryptoService } from '../src/common/services/crypto.service';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
const DRY = process.argv.includes('--dry-run');
const BATCH = 2000;

/** The dev key CryptoService derives when neither .env nor JWT_SECRET is present. */
const devKey = (purpose: 'enc' | 'index') =>
  createHash('sha256').update(`pii-${purpose}:bizdata-dev-secret`).digest();

/** Decrypt a v1/v2 AES-GCM payload with an explicit key (the dev one). */
function decryptWith(payload: string, key: Buffer): string | null {
  try {
    const p = payload.split('.');
    const [iv, tag, ct] = [p[p.length - 3], p[p.length - 2], p[p.length - 1]];
    const d = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
    d.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([d.update(Buffer.from(ct, 'base64')), d.final()]).toString('utf8');
  } catch { return null; }
}

const COLS = ['bvn', 'nin', 'accountNumber', 'phoneNumber'] as const;
const INDEX_OF: Partial<Record<(typeof COLS)[number], string>> = {
  bvn: 'bvnIndex', nin: 'ninIndex', accountNumber: 'accountIndex',
};

async function main() {
  const crypto = new CryptoService();
  await crypto.onModuleInit();
  const encDev = devKey('enc');

  const pending = COLS.map((c) => `"${c}" LIKE 'v2.dev.%'`).join(' OR ');
  const [{ count }] = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
    `SELECT COUNT(*)::bigint AS count FROM data_records WHERE ${pending}`,
  );
  const todo = Number(count);
  console.log(`${todo.toLocaleString()} row(s) hold dev-key PII.${DRY ? ' DRY RUN.' : ''}`);
  if (!todo) { console.log('Nothing to do.'); return; }

  let cursor = '', scanned = 0, rekeyed = 0, failed = 0;
  for (;;) {
    const rows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT id, ${COLS.map((c) => `"${c}"`).join(', ')} FROM data_records
        WHERE id > $1 AND (${pending}) ORDER BY id LIMIT ${BATCH}`,
      cursor,
    );
    if (!rows.length) break;
    cursor = rows[rows.length - 1].id;

    const ids: string[] = [];
    const out: Record<string, (string | null)[]> = {};
    for (const c of COLS) { out[c] = []; if (INDEX_OF[c]) out[INDEX_OF[c]!] = []; }

    for (const r of rows) {
      scanned++;
      let touched = false;
      const vals: Record<string, string | null> = {};
      for (const c of COLS) {
        const stored = r[c] as string | null;
        if (!stored?.startsWith('v2.dev.')) { vals[c] = null; if (INDEX_OF[c]) vals[INDEX_OF[c]!] = null; continue; }
        const plain = decryptWith(stored, encDev);
        if (!plain) { failed++; vals[c] = null; if (INDEX_OF[c]) vals[INDEX_OF[c]!] = null; continue; }
        vals[c] = crypto.encrypt(plain);                       // active real key
        if (INDEX_OF[c]) vals[INDEX_OF[c]!] = crypto.blindIndex(plain); // real index key
        touched = true; rekeyed++;
      }
      if (!touched) continue;
      ids.push(r.id);
      for (const k of Object.keys(out)) out[k].push(vals[k] ?? null);
    }

    if (ids.length && !DRY) {
      const keys = Object.keys(out);
      const setClause = keys.map((k) => `"${k}" = COALESCE(v."${k}", d."${k}")`).join(', ');
      const casts = keys.map((_, i) => `$${i + 2}::text[]`).join(', ');
      await prisma.$executeRawUnsafe(
        `UPDATE data_records d SET ${setClause}
           FROM (SELECT * FROM unnest($1::text[], ${casts}) AS t(id, ${keys.map((k) => `"${k}"`).join(', ')})) v
          WHERE d.id = v.id`,
        ids, ...keys.map((k) => out[k]),
      );
    }
    console.log(`  …${scanned.toLocaleString()}/${todo.toLocaleString()} · ${rekeyed.toLocaleString()} value(s) re-keyed`);
  }

  console.log(`\nDone. Scanned ${scanned.toLocaleString()}; re-keyed ${rekeyed.toLocaleString()} value(s)` +
    `${failed ? `; ${failed} could not be decrypted under the dev key` : ''}.`);
  if (DRY) console.log('DRY RUN — nothing written.');
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
