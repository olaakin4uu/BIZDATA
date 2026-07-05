import 'dotenv/config';
import { PrismaClient, Prisma } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as bcrypt from 'bcrypt';
import { createCipheriv, createHmac, randomBytes, createHash } from 'crypto';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// PII encryption — MUST mirror CryptoService so the app can decrypt/match seed data.
function loadKey(env: string, salt: string): Buffer {
  const raw = process.env[env];
  if (raw) return Buffer.from(raw, 'base64');
  return createHash('sha256').update(`${salt}:${process.env.JWT_SECRET || 'bizdata-dev-secret'}`).digest();
}
const ENC_KEY = loadKey('PII_ENC_KEY', 'pii-enc');
const IDX_KEY = loadKey('PII_INDEX_KEY', 'pii-index');
function encrypt(pt: string | null | undefined): string | null {
  if (pt == null || pt === '') return null;
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', ENC_KEY, iv);
  const ct = Buffer.concat([c.update(pt, 'utf8'), c.final()]);
  return `v1.${iv.toString('base64')}.${c.getAuthTag().toString('base64')}.${ct.toString('base64')}`;
}
function blindIndex(v: string | null | undefined): string | null {
  if (v == null || v === '') return null;
  return createHmac('sha256', IDX_KEY).update(String(v).trim()).digest('hex');
}
function encodeIds(src: { nin?: string | null; bvn?: string | null; tin?: string | null }) {
  return {
    ninEnc: encrypt(src.nin), ninIndex: blindIndex(src.nin),
    bvnEnc: encrypt(src.bvn), bvnIndex: blindIndex(src.bvn),
    tinEnc: encrypt(src.tin), tinIndex: blindIndex(src.tin),
  };
}

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

  // 4. Taxpayers, declared incomes, and observed flows (2025)
  // `declared` is the explicit assessable income (null = nothing declared).
  // `flows` are per-provider observed inflow/outflow used to exercise the engine.
  const SCAN_YEAR = 2025;
  const taxpayers: Array<{
    nin?: string; bvn?: string; tin?: string; cacRcNumber?: string;
    type: string; firstName?: string; lastName?: string; businessName?: string;
    stateOfResidence: string; declared: number | null;
    flows: Array<{ code: string; inflow: number; outflow: number }>;
  }> = [
    // Individuals
    { nin: '12345678901', bvn: '22200000001', tin: '1000000001', type: 'INDIVIDUAL', firstName: 'Adamu', lastName: 'Bello', stateOfResidence: 'Kano',
      declared: 2_000_000, flows: [ { code: 'CBN-057', inflow: 9_500_000, outflow: 3_000_000 }, { code: 'CBN-058', inflow: 6_000_000, outflow: 2_000_000 }, { code: 'NCC-OPAY', inflow: 2_500_000, outflow: 500_000 } ] }, // CRITICAL: big gap, 3 providers
    { nin: '12345678902', bvn: '22200000002', tin: '1000000002', type: 'INDIVIDUAL', firstName: 'Chinwe', lastName: 'Okafor', stateOfResidence: 'Lagos',
      declared: 8_000_000, flows: [ { code: 'CBN-057', inflow: 9_000_000, outflow: 4_000_000 } ] }, // clean: ~12% gap < threshold
    { nin: '12345678903', bvn: '22200000003', tin: '1000000003', type: 'INDIVIDUAL', firstName: 'Tunde', lastName: 'Adekunle', stateOfResidence: 'Oyo',
      declared: 1_000_000, flows: [ { code: 'CBN-PSTK', inflow: 6_000_000, outflow: 5_900_000 } ] }, // pass-through: normalized down, lower confidence
    { nin: '12345678904', bvn: '22200000004', tin: '1000000004', type: 'INDIVIDUAL', firstName: 'Fatima', lastName: 'Yusuf', stateOfResidence: 'Kaduna',
      declared: null, flows: [ { code: 'NCC-OPAY', inflow: 4_200_000, outflow: 1_000_000 } ] }, // NO_DECLARATION
    { nin: '12345678905', bvn: '22200000005', tin: '1000000005', type: 'INDIVIDUAL', firstName: 'Emeka', lastName: 'Nwosu', stateOfResidence: 'Enugu',
      declared: 30_000_000, flows: [ { code: 'CBN-058', inflow: 31_000_000, outflow: 12_000_000 } ] }, // clean
    // Corporates
    { cacRcNumber: 'RC-1001', tin: '2000000001', type: 'CORPORATE', businessName: 'Sahel Trading Ltd', stateOfResidence: 'Kano',
      declared: 40_000_000, flows: [ { code: 'CBN-057', inflow: 90_000_000, outflow: 30_000_000 }, { code: 'CBN-PSTK', inflow: 35_000_000, outflow: 10_000_000 } ] }, // CIT gap
    { cacRcNumber: 'RC-1002', tin: '2000000002', type: 'CORPORATE', businessName: 'Lagoon Logistics PLC', stateOfResidence: 'Lagos',
      declared: 120_000_000, flows: [ { code: 'CBN-058', inflow: 125_000_000, outflow: 60_000_000 } ] }, // clean
    { cacRcNumber: 'RC-1003', tin: '2000000003', type: 'CORPORATE', businessName: 'Rivers Petroleum Ltd', stateOfResidence: 'Rivers',
      declared: 200_000_000, flows: [ { code: 'CBN-057', inflow: 480_000_000, outflow: 120_000_000 }, { code: 'CBN-058', inflow: 150_000_000, outflow: 40_000_000 } ] }, // large CIT gap
    { cacRcNumber: 'RC-1004', tin: '2000000004', type: 'CORPORATE', businessName: 'Northern Foods Co', stateOfResidence: 'Kaduna',
      declared: 15_000_000, flows: [ { code: 'CBN-PSTK', inflow: 28_000_000, outflow: 9_000_000 } ] },
    { cacRcNumber: 'RC-1005', tin: '2000000005', type: 'CORPORATE', businessName: 'Capital Tech Holdings', stateOfResidence: 'Abuja',
      declared: 60_000_000, flows: [ { code: 'NAICOM-AIICO', inflow: 62_000_000, outflow: 20_000_000 } ] }, // clean
  ];

  // Provider lookup by code
  const provRows = await prisma.dataProvider.findMany({ select: { id: true, providerCode: true, providerType: true } });
  const provByCode = new Map(provRows.map((p) => [p.providerCode, p]));

  // Only seed observed flows once (idempotent guard)
  const existingRecordCount = await prisma.dataRecord.count();
  const seedFlows = existingRecordCount === 0;

  for (const tp of taxpayers) {
    const where: any = tp.nin ? { ninIndex: blindIndex(tp.nin) } : { cacRcNumber: tp.cacRcNumber };
    let row = await prisma.taxpayer.findFirst({ where });
    if (!row) {
      row = await prisma.taxpayer.create({
        data: {
          ...encodeIds(tp),
          cacRcNumber: tp.cacRcNumber || null,
          type: tp.type as any,
          firstName: tp.firstName || null,
          lastName: tp.lastName || null,
          businessName: tp.businessName || null,
          stateOfResidence: tp.stateOfResidence,
        },
      });
    } else {
      await prisma.taxpayer.update({ where: { id: row.id }, data: encodeIds(tp) });
    }

    if (tp.declared != null) {
      await prisma.declaredIncome.upsert({
        where: { taxpayerId_year: { taxpayerId: row.id, year: SCAN_YEAR } },
        update: { assessableIncome: new Prisma.Decimal(tp.declared) },
        create: { taxpayerId: row.id, year: SCAN_YEAR, assessableIncome: new Prisma.Decimal(tp.declared), source: 'MANUAL_IMPORT' },
      });
    }

    if (seedFlows) {
      const accountName = tp.businessName || `${tp.firstName} ${tp.lastName}`;
      for (const flow of tp.flows) {
        const prov = provByCode.get(flow.code);
        if (!prov) continue;
        const submission = await prisma.dataSubmission.create({
          data: {
            providerId: prov.id,
            periodLabel: String(SCAN_YEAR),
            periodYear: SCAN_YEAR,
            fileName: `seed-${prov.providerCode}-${SCAN_YEAR}.csv`,
            recordCount: 1, acceptedCount: 1, rejectedCount: 0,
            status: 'ACCEPTED', processedAt: new Date(),
          },
        });
        await prisma.dataRecord.create({
          data: {
            submissionId: submission.id,
            providerId: prov.id,
            providerType: prov.providerType,
            taxpayerId: row.id,
            nin: encrypt(tp.nin),
            bvn: encrypt(tp.bvn),
            accountName,
            matchMethod: tp.nin ? 'NIN' : 'TIN',
            matchConfidence: new Prisma.Decimal(tp.nin ? 0.98 : 0.97),
            periodLabel: String(SCAN_YEAR),
            periodYear: SCAN_YEAR,
            totalInflow: new Prisma.Decimal(flow.inflow),
            totalOutflow: new Prisma.Decimal(flow.outflow),
            transactionCount: Math.floor(flow.inflow / 50_000),
          },
        });
      }
    }
  }
  console.log(`  Taxpayers seeded: ${taxpayers.length}${seedFlows ? ' (with observed flows)' : ' (flows already present)'}`);
  console.log('Done.');
}

main()
  .catch(err => { console.error(err); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); await pool.end(); });
