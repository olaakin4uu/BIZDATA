import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as bcrypt from 'bcrypt';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('Seeding BizData...');

  // 1. Tenant
  let tenant = await prisma.tenant.findFirst();
  if (!tenant) {
    tenant = await prisma.tenant.create({
      data: {
        name: process.env.TENANT_NAME || 'BizData Demo Tenant',
        shortName: 'BizData',
        contactEmail: 'demo@bizdata.local',
        themeColor: '#0f766e',
      },
    });
    console.log('  Tenant created:', tenant.name);
  } else {
    console.log('  Tenant exists:', tenant.name);
  }

  // 2. Super admin
  const adminEmail = 'admin@bizdata.local';
  const adminPassword = 'Admin@1234';
  let admin = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (!admin) {
    const passwordHash = await bcrypt.hash(adminPassword, 10);
    admin = await prisma.user.create({
      data: {
        email: adminEmail,
        passwordHash,
        firstName: 'Super',
        lastName: 'Admin',
        role: 'SUPER_ADMIN',
        isActive: true,
      },
    });
    console.log(`  Admin created: ${adminEmail} / ${adminPassword}`);
  } else {
    console.log(`  Admin exists: ${adminEmail}`);
  }

  // 2b. Role-specific staff (to exercise field-level access scoping). Password: Staff@1234
  const roleUsers = [
    { email: 'analyst@bizdata.local', role: 'ANALYST', firstName: 'Ada', lastName: 'Analyst' },
    { email: 'auditor@bizdata.local', role: 'AUDIT_OFFICER', firstName: 'Audu', lastName: 'Auditor' },
    { email: 'supervisor@bizdata.local', role: 'SUPERVISOR', firstName: 'Sade', lastName: 'Supervisor' },
    { email: 'dpo@bizdata.local', role: 'DPO', firstName: 'Dapo', lastName: 'Protection' },
  ];
  const staffHash = await bcrypt.hash('Staff@1234', 10);
  for (const u of roleUsers) {
    const exists = await prisma.user.findUnique({ where: { email: u.email } });
    if (!exists) {
      await prisma.user.create({
        data: { email: u.email, passwordHash: staffHash, firstName: u.firstName, lastName: u.lastName, role: u.role as any, isActive: true },
      });
      console.log(`  Staff created: ${u.email} (${u.role}) / Staff@1234`);
    }
  }

  // 3. Providers — NTAA §29 financial institutions only (see common/section29.ts).
  const providers = [
    { code: 'CBN-057', name: 'Zenith Bank', type: 'BANK' },
    { code: 'CBN-058', name: 'GTBank', type: 'BANK' },
    { code: 'NCC-OPAY', name: 'Opay', type: 'FINTECH' },
    { code: 'NAICOM-AIICO', name: 'AIICO Insurance', type: 'INSURANCE' },
    { code: 'CBN-PSTK', name: 'Paystack', type: 'PAYMENT_PROCESSOR' },
  ];

  const providerPassword = 'Provider@1234';
  const providerHash = await bcrypt.hash(providerPassword, 10);

  for (const p of providers) {
    let prov = await prisma.dataProvider.findUnique({ where: { providerCode: p.code } });
    if (!prov) {
      prov = await prisma.dataProvider.create({
        data: {
          providerCode: p.code,
          name: p.name,
          providerType: p.type as any,
          status: 'ACTIVE',
          contactEmail: `compliance@${p.name.toLowerCase().replace(/\s+/g, '')}.local`,
          reportingFrequency: 'QUARTERLY', // policy: every §29 provider reports quarterly
        },
      });
      console.log(`  Provider created: ${p.name}`);
    }

    const userEmail = `admin@${p.name.toLowerCase().replace(/\s+/g, '')}.local`;
    const existingUser = await prisma.dataProviderUser.findUnique({ where: { email: userEmail } });
    if (!existingUser) {
      await prisma.dataProviderUser.create({
        data: {
          providerId: prov.id,
          email: userEmail,
          passwordHash: providerHash,
          firstName: 'Provider',
          lastName: 'Admin',
          role: 'PROVIDER_ADMIN',
        },
      });
      console.log(`    Provider user: ${userEmail} / ${providerPassword}`);
    }
  }

  // 4. Demo taxpayers/declared-income/observed-flows block REMOVED 2026-08-06.
  // It used to seed 15 fully-synthetic taxpayers (sequential fake NIN/BVN/TIN,
  // fictional names/companies) with fabricated declared-income and bank-flow
  // scenarios to exercise the underdeclaration engine. Because this entrypoint
  // runs on every boot (see docker-entrypoint.sh), that demo data was silently
  // re-upserting itself back into a live, public-facing KIRS instance on every
  // restart — discovered when a staff member noticed declared-income figures
  // with no Tax-app connection and no audit trail. The 15 taxpayers + their
  // data_records/data_submissions/risk_signals were hard-deleted from prod; this
  // block is gone so they can never come back via a routine restart. If demo
  // data is needed again (e.g. for a sandbox/staging instance only), write a
  // separate opt-in script — never wire demo data into the every-boot path.
  console.log('Done.');
}

main()
  .catch(err => { console.error(err); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); await pool.end(); });
