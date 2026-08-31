/**
 * Issue a fresh password-reset link for every ACTIVE provider portal user.
 *
 * Links last 7 days — INVITE_TTL_MS, the same constant the portal already uses.
 * Nothing here overrides it; the duration is the product's, not this script's.
 *
 * ⚠ THIS INVALIDATES CURRENT PASSWORDS. resetPassword() parks each account on a
 * secret nobody is told and sets mustChangePassword, so a provider's existing
 * password stops working the moment this runs and can only be replaced through
 * their link. That is irreversible. Dry run first; --commit is deliberate.
 *
 * It calls the REAL ProviderUsersService rather than writing rows itself, for
 * one reason above all: the audit log is hash-chained, and a hand-written INSERT
 * would corrupt the chain. Going through the service also means the token
 * generation, hashing and TTL are literally the same code the UI runs, so this
 * cannot drift from it.
 *
 * Boots a minimal Nest context — PrismaModule and CommonModule only — so no
 * scheduler, cron or scan job starts up alongside it.
 *
 * Mail is not configured on the findata server, so nothing is sent to the
 * institutions; every link comes back in the CSV for hand-off by a person.
 *
 * Usage — ts-node, NOT tsx:
 *   npx ts-node scripts/issue-provider-reset-links.ts --actor=<staff-user-id>
 *   npx ts-node scripts/issue-provider-reset-links.ts --actor=<staff-user-id> --commit
 *   npx ts-node scripts/issue-provider-reset-links.ts --actor=<id> --only=a@b.com,c@d.com --commit
 *
 * --only exists because the alternative is dangerous: a provider onboarded after
 * a run needs ONE link, and re-running the whole script to get it would reset the
 * other forty-seven and invalidate every link already handed out.
 *
 * ⚠ The other scripts here run under `npx tsx`, and this one must not. tsx uses
 * esbuild, which does not emit `design:paramtypes`, so Nest injects NOTHING into
 * a constructor and every dependency arrives undefined. It fails at the first
 * use — "Cannot read properties of undefined (reading 'dataProviderUser')" — not
 * at wiring time, so it looks like a database fault rather than a build one. The
 * other scripts are unaffected because they use a plain PrismaClient with no DI.
 *
 * The CSV holds live credentials. It is written 0600, and should be deleted
 * once the links have been handed over.
 */
import 'dotenv/config';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuditService } from '../src/common/services/audit.service';
import { MailService } from '../src/common/services/mail.service';
import { ProviderUsersService } from '../src/modules/provider-users/provider-users.service';

// The two services ProviderUsersService actually needs, provided directly.
//
// Importing CommonModule instead would drag in the passport JWT strategies,
// which read ConfigService — available in the app only because AppModule
// registers ConfigModule globally. They authenticate HTTP requests and this
// script makes none, so constructing them was pure liability: the context
// failed before reaching any provider. AuditService needs only Prisma and
// MailService reads process.env, so neither needs anything more.
//
// AuditService specifically must be the real one: it chains each entry to the
// hash of the previous, and that chain is checked.
@Module({
  imports: [PrismaModule],
  providers: [ProviderUsersService, AuditService, MailService],
})
class ScriptModule {}

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
}

function csvCell(v: unknown): string {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

async function main() {
  const commit = process.argv.includes('--commit');
  const actorId = arg('actor');
  const only = (arg('only') ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  if (!actorId) {
    throw new Error('--actor=<staff-user-id> is required: every reset is audited against a real person.');
  }

  const app = await NestFactory.createApplicationContext(ScriptModule, { logger: ['error', 'warn'] });
  const prisma = app.get(PrismaService);
  const service = app.get(ProviderUsersService);

  // Attribute to a real, active staff account or refuse. An audit trail naming
  // nobody is worse than no audit trail, because it looks like one.
  const actor = await prisma.user.findFirst({
    where: { id: actorId, isActive: true },
    select: { id: true, email: true, role: true },
  });
  if (!actor) throw new Error(`No active staff user with id ${actorId}`);
  if (!['SUPER_ADMIN', 'ADMIN'].includes(actor.role)) {
    throw new Error(`${actor.email} is ${actor.role}; the portal restricts this to ADMIN / SUPER_ADMIN.`);
  }

  const users = await prisma.dataProviderUser.findMany({
    where: {
      isActive: true,
      ...(only.length ? { email: { in: only, mode: 'insensitive' as const } } : {}),
    },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      lastLoginAt: true,
      provider: { select: { name: true } },
    },
    orderBy: [{ provider: { name: 'asc' } }, { email: 'asc' }],
  });

  // A typo in --only would otherwise silently issue nothing and report success.
  if (only.length) {
    const found = new Set(users.map((u) => u.email.toLowerCase()));
    const missing = only.filter((e) => !found.has(e));
    if (missing.length) {
      throw new Error(`No active provider user for: ${missing.join(', ')}`);
    }
  }

  const everLoggedIn = users.filter((u) => u.lastLoginAt).length;
  console.log(`Actor:      ${actor.email} (${actor.role})`);
  console.log(
    `Recipients: ${users.length} active provider user${users.length === 1 ? '' : 's'}` +
      (only.length ? ' (filtered by --only)' : ''),
  );
  console.log(`Of those:   ${everLoggedIn} have a working password that this will invalidate`);
  console.log(`Mode:       ${commit ? 'COMMIT — passwords will be reset' : 'DRY RUN — nothing will change'}`);
  console.log('');

  if (!commit) {
    for (const u of users) {
      console.log(`  would reset  ${u.provider?.name ?? '(no provider)'} — ${u.email}`);
    }
    console.log(`\nDry run only. Re-run with --commit to issue the links.`);
    await app.close();
    return;
  }

  const rows: string[] = ['provider,name,email,reset_link,expires_at,status'];
  let ok = 0;
  const failures: Array<{ email: string; reason: string }> = [];

  for (const u of users) {
    const who = `${u.provider?.name ?? '(no provider)'} — ${u.email}`;
    try {
      // newPassword omitted: the service generates the parked secret and the
      // single-use link, exactly as the admin screen does.
      const res = await service.resetPassword(u.id, undefined, actor.id);
      const c = res.credentials;
      rows.push(
        [
          u.provider?.name ?? '',
          `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim(),
          u.email,
          c.inviteUrl,
          c.expiresAt,
          'issued',
        ]
          .map(csvCell)
          .join(','),
      );
      ok += 1;
      console.log(`  issued   ${who}`);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      failures.push({ email: u.email, reason });
      rows.push([u.provider?.name ?? '', '', u.email, '', '', `FAILED: ${reason}`].map(csvCell).join(','));
      // Carry on: one bad row must not strand the other forty-seven.
      console.error(`  FAILED   ${who} — ${reason}`);
    }
  }

  const stamp = new Date().toISOString().slice(0, 10);
  // A filtered run must not overwrite the full run's file.
  const suffix = only.length ? `-partial-${Date.now()}` : '';
  const out = path.join(process.cwd(), `provider-reset-links-${stamp}${suffix}.csv`);
  fs.writeFileSync(out, rows.join('\n') + '\n', { mode: 0o600 });

  console.log('');
  console.log(`Issued ${ok} of ${users.length}. Failures: ${failures.length}`);
  console.log(`Links written to ${out} (mode 0600 — it holds live credentials; delete it once handed over).`);
  if (failures.length) {
    console.log('\nFailed:');
    for (const f of failures) console.log(`  ${f.email} — ${f.reason}`);
  }

  await app.close();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
