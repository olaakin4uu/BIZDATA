/**
 * One-off DEV utility: re-seal the audit hash chain after the Date-serialization
 * fix in stableStringify (common/services/audit.service.ts).
 *
 * Historical rows written before the fix carry hashes computed from an in-memory
 * `Date` serialized as `{}`, which no longer matches the corrected serializer —
 * so /audit/verify falsely reports "tampered". This walks every row in creation
 * order, recomputes hashChainPrev/hashChainCurr with the CURRENT serializer, and
 * appends one AUDIT_CHAIN_RESEAL entry recording that it happened.
 *
 * This is ONLY appropriate for throwaway dev/demo data. A production evidentiary
 * log is never rewritten — the whole point of the chain is to make that visible.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { auditPayload, auditHash } from '../src/common/services/audit.service';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main() {
  const rows = await prisma.auditLog.findMany({
    orderBy: { createdAt: 'asc' },
    select: {
      id: true, actorType: true, actorId: true, action: true, entity: true,
      entityId: true, beforeJson: true, afterJson: true, createdAt: true,
    },
  });
  console.log(`Re-sealing ${rows.length} audit rows with the corrected serializer…`);

  let prevHash = '';
  let rewritten = 0;
  for (const r of rows) {
    const payload = auditPayload({ ...r, ts: r.createdAt.toISOString() });
    const curr = auditHash(prevHash, payload);
    await prisma.auditLog.update({
      where: { id: r.id },
      data: { hashChainPrev: prevHash || null, hashChainCurr: curr },
    });
    prevHash = curr;
    rewritten++;
  }

  // Append a record OF the re-seal itself, chained onto the freshly-sealed head.
  const ts = new Date();
  const resealPayload = auditPayload({
    actorType: 'SYSTEM', actorId: null, action: 'AUDIT_CHAIN_RESEAL',
    entity: 'AuditLog', entityId: null,
    beforeJson: null,
    afterJson: { rewritten, reason: 'Date-serialization fix in stableStringify', env: 'dev' },
    ts: ts.toISOString(),
  });
  const resealCurr = auditHash(prevHash, resealPayload);
  await prisma.auditLog.create({
    data: {
      actorType: 'SYSTEM', action: 'AUDIT_CHAIN_RESEAL', entity: 'AuditLog',
      afterJson: { rewritten, reason: 'Date-serialization fix in stableStringify', env: 'dev' },
      createdAt: ts, hashChainPrev: prevHash || null, hashChainCurr: resealCurr,
    },
  });

  console.log(`Done. Re-sealed ${rewritten} rows + 1 AUDIT_CHAIN_RESEAL marker.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); await pool.end(); });
