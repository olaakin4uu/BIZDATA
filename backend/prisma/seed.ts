import 'dotenv/config';
import { PrismaClient, Prisma } from '@prisma/client';
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

  // 3. Providers
  const providers = [
    { code: 'CBN-057', name: 'Zenith Bank', type: 'BANK' },
    { code: 'CBN-058', name: 'GTBank', type: 'BANK' },
    { code: 'NCC-OPAY', name: 'Opay', type: 'FINTECH' },
    { code: 'NCC-MTN', name: 'MTN Nigeria', type: 'TELCO' },
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
          reportingFrequency: p.type === 'BANK' ? 'QUARTERLY' : 'MONTHLY',
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

  // 4. Taxpayers + declared incomes
  const taxpayers = [
    { nin: '12345678901', type: 'INDIVIDUAL', firstName: 'Adamu', lastName: 'Bello', stateOfResidence: 'Kano' },
    { nin: '12345678902', type: 'INDIVIDUAL', firstName: 'Chinwe', lastName: 'Okafor', stateOfResidence: 'Lagos' },
    { nin: '12345678903', type: 'INDIVIDUAL', firstName: 'Tunde', lastName: 'Adekunle', stateOfResidence: 'Oyo' },
    { nin: '12345678904', type: 'INDIVIDUAL', firstName: 'Fatima', lastName: 'Yusuf', stateOfResidence: 'Kaduna' },
    { nin: '12345678905', type: 'INDIVIDUAL', firstName: 'Emeka', lastName: 'Nwosu', stateOfResidence: 'Enugu' },
    { cacRcNumber: 'RC-1001', type: 'CORPORATE', businessName: 'Sahel Trading Ltd', stateOfResidence: 'Kano' },
    { cacRcNumber: 'RC-1002', type: 'CORPORATE', businessName: 'Lagoon Logistics PLC', stateOfResidence: 'Lagos' },
    { cacRcNumber: 'RC-1003', type: 'CORPORATE', businessName: 'Rivers Petroleum Ltd', stateOfResidence: 'Rivers' },
    { cacRcNumber: 'RC-1004', type: 'CORPORATE', businessName: 'Northern Foods Co', stateOfResidence: 'Kaduna' },
    { cacRcNumber: 'RC-1005', type: 'CORPORATE', businessName: 'Capital Tech Holdings', stateOfResidence: 'Abuja' },
  ];

  for (const tp of taxpayers) {
    const where: any = tp.nin ? { nin: tp.nin } : { cacRcNumber: tp.cacRcNumber };
    let row = await prisma.taxpayer.findFirst({ where });
    if (!row) {
      row = await prisma.taxpayer.create({
        data: {
          nin: tp.nin || null,
          cacRcNumber: tp.cacRcNumber || null,
          type: tp.type as any,
          firstName: tp.firstName || null,
          lastName: tp.lastName || null,
          businessName: tp.businessName || null,
          stateOfResidence: tp.stateOfResidence,
        },
      });
    }
    const declared = Math.floor(Math.random() * 50_000_000) + 5_000_000;
    await prisma.declaredIncome.upsert({
      where: { taxpayerId_year: { taxpayerId: row.id, year: 2025 } },
      update: { assessableIncome: new Prisma.Decimal(declared) },
      create: {
        taxpayerId: row.id,
        year: 2025,
        assessableIncome: new Prisma.Decimal(declared),
        source: 'MANUAL_IMPORT',
      },
    });
  }
  console.log(`  Taxpayers seeded: ${taxpayers.length}`);
  console.log('Done.');
}

main()
  .catch(err => { console.error(err); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); await pool.end(); });
