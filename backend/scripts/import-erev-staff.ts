/**
 * Import erev STAFF users into findata (User table). Scoped to the 28 admin/staff
 * accounts (main_agent revenue-collection agents excluded upstream). Carries the
 * original bcrypt password hash; maps roles admin→ADMIN, staff→ANALYST; forces a
 * password change on first login (their erev password still authenticates).
 *
 * Reads scripts/erev_staff.json (path overridable via STAFF_FILE).
 * Idempotent: skips any email that already exists.
 *
 * Run:  npx tsx scripts/import-erev-staff.ts
 */
import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient, UserRole } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const FILE = process.env.STAFF_FILE || path.join(__dirname, 'erev_staff.json');

function splitName(raw: string): { firstName: string; lastName: string } {
  const parts = (raw || 'Unknown').trim().split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

function mapRole(employeeType: string): UserRole {
  return employeeType === 'admin' ? UserRole.ADMIN : UserRole.ANALYST;
}

async function main() {
  if (!fs.existsSync(FILE)) throw new Error(`staff file not found: ${FILE}`);
  const rows: Array<{ name: string; email: string; phone?: string | null; password: string; employee_type: string }> =
    JSON.parse(fs.readFileSync(FILE, 'utf-8'));
  console.log(`erev staff to import: ${rows.length}`);

  let created = 0, skipped = 0;
  const byRole: Record<string, number> = {};
  for (const r of rows) {
    const email = (r.email || '').toLowerCase().trim();
    if (!email || !r.password || !r.password.startsWith('$2')) { skipped++; continue; }
    const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (existing) { skipped++; continue; }

    const { firstName, lastName } = splitName(r.name);
    const role = mapRole(r.employee_type);
    // Laravel $2y$ hashes are cross-compatible with node bcrypt; store as-is.
    await prisma.user.create({
      data: {
        email,
        passwordHash: r.password,
        firstName,
        lastName,
        phone: r.phone || undefined,
        role,
        isActive: true,
        mustChangePassword: true, // force a fresh, findata-vetted password on first login
      },
    });
    created++;
    byRole[role] = (byRole[role] ?? 0) + 1;
  }

  console.log(`Created: ${created}, skipped (exists/invalid): ${skipped}`);
  console.log('By role:', byRole);
  const total = await prisma.user.count();
  console.log(`Total staff users now: ${total}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); await pool.end(); });
