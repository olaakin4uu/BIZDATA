/**
 * Backfill data_records.bvnIndex / ninIndex — and encrypt any identifier still
 * sitting in the clear.
 *
 * Why both at once: the bulk importers used to write the raw BVN / account
 * number / phone straight onto the record while correctly encrypting the
 * taxpayer's copy, so historic rows hold plaintext PII. The account-linkage
 * report needs a deterministic index to group on, and computing it means
 * touching every row anyway — so the same pass also re-writes any plaintext
 * value as ciphertext.
 *
 * Safe to re-run: rows that already carry both indexes are skipped, and a value
 * that is already ciphertext is decrypted-then-indexed rather than double
 * encrypted (CryptoService.decrypt returns unprefixed input unchanged, so the
 * same code path handles plaintext and ciphertext).
 *
 *   npx ts-node scripts/backfill-record-identifier-indexes.ts [--dry-run]
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { CryptoService } from '../src/common/services/crypto.service';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
const DRY = process.argv.includes('--dry-run');
const BATCH = 500;

/** Already an AES-GCM payload written by CryptoService? */
function isCiphertext(v: string | null): boolean {
  return !!v && (v.startsWith('v1.') || v.startsWith('v2.'));
}

async function main() {
  const crypto = new CryptoService();
  await crypto.onModuleInit();

  const total = await prisma.dataRecord.count({
    where: { OR: [{ bvn: { not: null } }, { nin: { not: null } }, { accountNumber: { not: null } }, { phoneNumber: { not: null } }] },
  });
  console.log(`${total} record(s) carry an identifier.${DRY ? ' DRY RUN — nothing will be written.' : ''}`);

  let cursor: string | undefined;
  let scanned = 0, indexed = 0, encrypted = 0;

  for (;;) {
    const rows = await prisma.dataRecord.findMany({
      where: { OR: [{ bvn: { not: null } }, { nin: { not: null } }, { accountNumber: { not: null } }, { phoneNumber: { not: null } }] },
      select: { id: true, bvn: true, nin: true, accountNumber: true, phoneNumber: true, bvnIndex: true, ninIndex: true, accountIndex: true },
      orderBy: { id: 'asc' },
      take: BATCH,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (!rows.length) break;
    cursor = rows[rows.length - 1].id;

    for (const r of rows) {
      scanned++;
      const data: Record<string, string | null> = {};

      // Identifier columns: derive the blind index from the PLAINTEXT value,
      // then make sure what is stored is ciphertext.
      for (const [col, idxCol] of [['bvn', 'bvnIndex'], ['nin', 'ninIndex'], ['accountNumber', 'accountIndex']] as const) {
        const stored = (r as any)[col] as string | null;
        if (!stored) continue;
        const plain = crypto.decrypt(stored);
        if (!plain) continue;
        if (!(r as any)[idxCol]) { data[idxCol] = crypto.blindIndex(plain); indexed++; }
        if (!isCiphertext(stored)) { data[col] = crypto.encrypt(plain); encrypted++; }
      }
      // Phone has no index, but must not sit in the clear either.
      if (r.phoneNumber && !isCiphertext(r.phoneNumber)) {
        const plain = crypto.decrypt(r.phoneNumber);
        if (plain) { data.phoneNumber = crypto.encrypt(plain); encrypted++; }
      }

      if (Object.keys(data).length && !DRY) {
        await prisma.dataRecord.update({ where: { id: r.id }, data });
      }
    }
    console.log(`  …${scanned}/${total} scanned, ${indexed} index(es) written, ${encrypted} value(s) encrypted`);
  }

  console.log(`\nDone. Scanned ${scanned}; wrote ${indexed} blind index(es); encrypted ${encrypted} previously-plaintext value(s).`);
  if (DRY) console.log('DRY RUN — no changes were persisted.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
