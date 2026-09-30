/**
 * DEMO TENANT SEED — synthetic data for presentation and evaluation.
 *
 * Why this exists: the working database holds a real revenue authority's
 * taxpayer roll. Showing that to a different organisation has no lawful basis
 * under NDPA 2023 — it was collected for tax administration, not for marketing —
 * and it discloses one client's taxpayers, inflows and provider performance to
 * another. Redacting screenshots does not fix it either: the combination of
 * institution, locality and amount re-identifies a party even with the name
 * removed.
 *
 * So the demo runs on its own database with invented parties. Every taxpayer
 * name, identifier and amount below is generated from a seeded PRNG. Nothing is
 * copied from, derived from, or reversible to the live dataset, and no string in
 * this file names the authority whose data that is.
 *
 * Identifiers go through the application's own CryptoService rather than being
 * written as plaintext columns, so the AES-GCM ciphertext and the HMAC blind
 * indexes agree. Hand-writing those columns would desynchronise them and
 * silently break Account Linkage and Data Quality — the two screens a demo most
 * needs working.
 *
 *   DATABASE_URL="postgresql://…/findata_demo" npx ts-node scripts/seed-demo-tenant.ts
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as bcrypt from 'bcrypt';
import * as fs from 'fs';
import * as path from 'path';
import { CryptoService } from '../src/common/services/crypto.service';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

// Seeded PRNG so a reseed reproduces exactly the same demo.
let seed = 20260930;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const pick = <T>(a: readonly T[]): T => a[Math.floor(rnd() * a.length)];
const int = (lo: number, hi: number) => lo + Math.floor(rnd() * (hi - lo + 1));
const pad = (n: number | string, w: number) => String(n).padStart(w, '0');

const FIRST = ['Adebayo', 'Folasade', 'Oluwaseun', 'Chinwe', 'Babatunde', 'Yetunde', 'Ifeoluwa',
  'Gbenga', 'Morayo', 'Tolulope', 'Segun', 'Aderonke', 'Kehinde', 'Taiwo', 'Bolanle', 'Femi',
  'Abiodun', 'Omolara', 'Damilola', 'Funmilayo', 'Olamide', 'Temitope', 'Sikiru', 'Ayodeji',
  'Halima', 'Emeka', 'Ngozi', 'Ibrahim', 'Blessing', 'Chukwuemeka'];
const LAST = ['Adeyemi', 'Ogunleye', 'Balogun', 'Odutola', 'Sonaike', 'Adewale', 'Onabanjo',
  'Kuforiji', 'Ademola', 'Oyelaran', 'Shodipo', 'Ogundipe', 'Dosunmu', 'Anjorin', 'Oluwole',
  'Bankole', 'Ilori', 'Fadipe', 'Salako', 'Odunsi', 'Okonkwo', 'Eze', 'Bello', 'Danjuma'];

// Invented businesses: Ogun localities + generic trade words. Not taken from any
// real register.
const BIZ_HEAD = ['Abeokuta', 'Ijebu', 'Sagamu', 'Ota', 'Ilaro', 'Ayetoro', 'Owode', 'Iperu',
  'Odogbolu', 'Ifo', 'Agbara', 'Remo', 'Egba', 'Yewa', 'Obafemi', 'Ewekoro'];
const BIZ_TAIL = ['Agro Allied', 'Cement & Aggregates', 'Textile Mills', 'Logistics', 'Poultry Farms',
  'Foods & Beverages', 'Plastics', 'Construction', 'Petroleum Services', 'Pharmaceuticals',
  'Quarry & Mining', 'Printing Works', 'Furniture', 'Cold Chain', 'Packaging', 'Paints & Chemicals',
  'Steel Works', 'Motors', 'Timber', 'Rubber Estates'];
const BIZ_SUFFIX = ['Limited', 'Nigeria Limited', 'Enterprises', 'Industries Plc', 'Ventures', '& Sons Limited'];

const LGAS = ['Abeokuta North', 'Abeokuta South', 'Ado-Odo/Ota', 'Egbado North', 'Egbado South',
  'Ewekoro', 'Ifo', 'Ijebu East', 'Ijebu North', 'Ijebu Ode', 'Ikenne', 'Imeko Afon', 'Ipokia',
  'Obafemi Owode', 'Odeda', 'Odogbolu', 'Ogun Waterside', 'Remo North', 'Sagamu'];

const SECTORS = ['Manufacturing', 'Agriculture', 'Construction', 'Trade', 'Logistics',
  'Professional Services', 'Hospitality', 'Education', 'Healthcare', 'Real Estate'];

/** Reporting institutions — invented names, so no real bank is shown with an
 *  invented filing record against it. */
const PROVIDERS: { name: string; type: string }[] = [
  { name: 'Anchor Trust Bank Plc', type: 'BANK' },
  { name: 'Gateway Commercial Bank Plc', type: 'BANK' },
  { name: 'Meridian Union Bank Plc', type: 'BANK' },
  { name: 'Cardinal Savings Bank Ltd', type: 'BANK' },
  { name: 'Summit Heritage Bank Plc', type: 'BANK' },
  { name: 'Riverstone Merchant Bank Ltd', type: 'BANK' },
  { name: 'Harbour Community Bank Ltd', type: 'BANK' },
  { name: 'PayBridge Technologies Ltd', type: 'FINTECH' },
  { name: 'Swiftpay Solutions Ltd', type: 'PAYMENT_PROCESSOR' },
  { name: 'Olumo Insurance Plc', type: 'INSURANCE' },
  { name: 'Lakeview Bureau De Change Ltd', type: 'FX_BUREAU' },
  { name: 'Corral POS Aggregators Ltd', type: 'POS_AGGREGATOR' },
];

const YEAR = 2026;

/**
 * Only quarters whose return has actually fallen due are filed.
 *
 * A demo that shows returns for a quarter that has not happened yet is the first
 * thing a reviewer notices. A quarter ends on the last day of its third month and
 * the return falls due `DUE_DAYS` later (the statutory default); anything not yet
 * due is left unfiled, which is also more useful — it gives the filing calendar a
 * genuine "due soon" period instead of a wall of green.
 */
const DUE_DAYS = 15;
function filedQuarters(now: Date): { q: number; label: string; endsOn: Date; dueOn: Date }[] {
  const out = [];
  for (let q = 0; q < 4; q++) {
    const endsOn = new Date(Date.UTC(YEAR, q * 3 + 3, 0));        // last day of the quarter
    const dueOn = new Date(endsOn.getTime() + DUE_DAYS * 86400000);
    if (dueOn <= now) out.push({ q, label: `${YEAR}-Q${q + 1}`, endsOn, dueOn });
  }
  return out;
}

async function main() {
  const url = String(process.env.DATABASE_URL || '');
  if (!/findata_demo/.test(url)) {
    throw new Error('Refusing to run: DATABASE_URL is not findata_demo — ' + url.replace(/:[^:@]*@/, ':***@'));
  }

  const crypto = new CryptoService();
  await crypto.onModuleInit();   // loads the same keys the app uses
  const enc = (v: string) => crypto.encrypt(v);
  const idx = (v: string) => crypto.blindIndex(v);

  console.log('Seeding DEMO tenant (synthetic data only)…');

  // Idempotent: clear the generated rows so a re-run replaces rather than
  // duplicates. Safe because the guard above proves this is the demo database.
  await prisma.$executeRawUnsafe(`
    TRUNCATE data_records, data_submissions, declared_incomes, taxpayers,
             data_providers, risk_signals, underdeclaration_cases,
             underdeclaration_scans RESTART IDENTITY CASCADE`);
  console.log('  cleared previous demo rows');

  // ── 1. Tenant ──────────────────────────────────────────────────────────────
  const logoPath = path.join(__dirname, 'demo-assets', 'ogirs-logo.b64');
  const logoUrl = fs.existsSync(logoPath) ? fs.readFileSync(logoPath, 'utf8').trim() : null;
  let tenant = await prisma.tenant.findFirst();
  if (!tenant) {
    tenant = await prisma.tenant.create({
      data: {
        name: 'OGUN STATE INTERNAL REVENUE SERVICE',
        shortName: 'OGIRS',
        contactEmail: 'info@ogirs.og.gov.ng',
        themeColor: '#0f766e',
        ...(logoUrl ? { logoUrl } : {}),
      } as never,
    });
  }
  console.log('  tenant:', tenant.name, logoUrl ? '(with logo)' : '(NO LOGO)');

  // ── 2. Staff ───────────────────────────────────────────────────────────────
  const staff = [
    { email: 'admin@ogirs.og.gov.ng', role: 'SUPER_ADMIN', firstName: 'Adeola', lastName: 'Ogunsanya' },
    { email: 'analyst@ogirs.og.gov.ng', role: 'ANALYST', firstName: 'Ifeoluwa', lastName: 'Bankole' },
    { email: 'supervisor@ogirs.og.gov.ng', role: 'SUPERVISOR', firstName: 'Tunde', lastName: 'Kuforiji' },
    { email: 'auditor@ogirs.og.gov.ng', role: 'AUDIT_OFFICER', firstName: 'Morayo', lastName: 'Shodipo' },
    { email: 'dpo@ogirs.og.gov.ng', role: 'DPO', firstName: 'Segun', lastName: 'Onabanjo' },
  ] as const;
  const hash = await bcrypt.hash('Demo@2026', 10);
  for (const s of staff) {
    await prisma.user.upsert({
      where: { email: s.email },
      update: {},
      create: { email: s.email, passwordHash: hash, firstName: s.firstName, lastName: s.lastName,
                role: s.role as never, isActive: true } as never,
    });
  }
  console.log('  staff:', staff.length, '— password Demo@2026');

  // ── 3. Reporting institutions ──────────────────────────────────────────────
  const providers: { id: string; name: string; type: string }[] = [];
  for (let i = 0; i < PROVIDERS.length; i++) {
    const p = PROVIDERS[i];
    const found = await prisma.dataProvider.findFirst({ where: { name: p.name } });
    const row = found ?? await prisma.dataProvider.create({
      data: {
        providerCode: 'OG-' + pad(i + 1, 3),
        name: p.name,
        providerType: p.type as never,
        status: 'ACTIVE',
        reportingFrequency: 'QUARTERLY',
        contactEmail: 'returns@' + p.name.toLowerCase().replace(/[^a-z]+/g, '').slice(0, 18) + '.ng',
      } as never,
    });
    providers.push({ id: row.id, name: row.name, type: p.type });
  }
  console.log('  providers:', providers.length);

  // ── 4. Taxpayers ───────────────────────────────────────────────────────────
  type TP = { id: string; type: 'INDIVIDUAL' | 'CORPORATE'; nin: string; bvn: string; tin: string; label: string };
  const taxpayers: TP[] = [];
  const INDIVIDUALS = 700, COMPANIES = 300;

  for (let i = 0; i < INDIVIDUALS + COMPANIES; i++) {
    const isCo = i >= INDIVIDUALS;
    const nin = isCo ? '' : '2' + pad(int(100000000, 999999999), 10).slice(0, 10);
    const bvn = '1' + pad(int(100000000, 999999999), 10).slice(0, 10);
    const tin = pad(int(10000000, 99999999), 8) + '-0001';
    const first = pick(FIRST), last = pick(LAST);
    const businessName = `${pick(BIZ_HEAD)} ${pick(BIZ_TAIL)} ${pick(BIZ_SUFFIX)}`;
    const row = await prisma.taxpayer.create({
      data: {
        type: isCo ? 'CORPORATE' : 'INDIVIDUAL',
        status: 'ACTIVE',
        ...(isCo
          ? { businessName, cacRcNumber: 'RC' + int(100000, 1999999), isLimitedLiability: /Limited|Plc/.test(businessName) }
          : { firstName: first, lastName: last, isLimitedLiability: false }),
        // Encrypted + blind-indexed by the application's own service.
        ...(nin ? { ninEnc: enc(nin), ninIndex: idx(nin) } : {}),
        bvnEnc: enc(bvn), bvnIndex: idx(bvn),
        // Registry TIN coverage is deliberately partial, so Data Quality has a
        // real gap to report rather than a perfect 100%.
        ...(rnd() < 0.62 ? { tinEnc: enc(tin), tinIndex: idx(tin) } : {}),
        stateOfResidence: 'Ogun',
        address: `${int(1, 240)} ${pick(BIZ_HEAD)} Road, ${pick(LGAS)}, Ogun State`,
        sector: pick(SECTORS),
        riskScore: 0,
        riskLevel: 'LOW',
      } as never,
    });
    taxpayers.push({
      id: row.id, type: isCo ? 'CORPORATE' : 'INDIVIDUAL', nin, bvn, tin,
      label: isCo ? businessName : `${first} ${last}`,
    });
    if ((i + 1) % 250 === 0) console.log('    taxpayers…', i + 1);
  }
  console.log('  taxpayers:', taxpayers.length);

  // ── 5. Declared income ─────────────────────────────────────────────────────
  // Set below the inflow generated in step 6 for a deliberate slice, so the scan
  // finds genuine under-declaration instead of noise.
  const underDeclarers = new Set<string>();
  let declaredRows = 0;
  for (const t of taxpayers) {
    if (rnd() > 0.78) continue;                                   // not everyone files
    const under = rnd() < 0.34;
    if (under) underDeclarers.add(t.id);
    const declared = t.type === 'CORPORATE'
      ? (under ? int(30, 120) : int(300, 900)) * 1_000_000
      : (under ? int(2, 9) : int(20, 70)) * 1_000_000;
    await prisma.declaredIncome.create({
      data: { taxpayerId: t.id, year: YEAR, assessableIncome: declared, source: 'SELF_ASSESSMENT' } as never,
    });
    declaredRows++;
  }
  console.log('  declared income rows:', declaredRows, '(under-declaring:', underDeclarers.size + ')');

  // ── 6. Provider returns ────────────────────────────────────────────────────
  // One submission per provider per quarter, with records beneath it. A slice of
  // taxpayers deliberately banks with more than one institution so Account
  // Linkage has cross-provider groups to find.
  const now = new Date();
  const quarters = filedQuarters(now);
  console.log('  filing quarters due as at', now.toISOString().slice(0, 10) + ':',
    quarters.map((x) => x.label).join(', ') || '(none)');

  let submissions = 0, records = 0;
  for (const p of providers) {
    for (const { q, label: periodLabel, endsOn, dueOn } of quarters) {
      // Most institutions file within the window; two file after the due date, so
      // Compliance and the §101 penalty screens have something real to show.
      const late = /Harbour|Corral/.test(p.name) && q >= 1;
      // On time = between quarter end and the due date. Late = after it.
      const filedAt = late
        ? new Date(dueOn.getTime() + int(4, 21) * 86400000)
        : new Date(endsOn.getTime() + int(2, DUE_DAYS - 1) * 86400000);
      const sub = await prisma.dataSubmission.create({
        data: {
          providerId: p.id, periodLabel, periodYear: YEAR, periodQuarter: q + 1,
          fileName: `${p.name.replace(/[^A-Za-z]+/g, '_').toLowerCase()}_${periodLabel}.csv`,
          recordCount: 0, acceptedCount: 0, rejectedCount: 0, warningCount: 0,
          status: 'ACCEPTED',
          receivedAt: filedAt,
          processedAt: new Date(filedAt.getTime() + int(1, 6) * 3600000),
        } as never,
      });
      submissions++;

      // Which taxpayers this institution holds accounts for.
      const holders = taxpayers.filter(() => rnd() < 0.22);
      let accepted = 0;
      for (const t of holders) {
        const big = underDeclarers.has(t.id);
        const inflow = t.type === 'CORPORATE'
          ? (big ? int(400, 2600) : int(20, 380)) * 1_000_000
          : (big ? int(30, 260) : int(1, 28)) * 1_000_000;
        const outflow = Math.round(inflow * (0.45 + rnd() * 0.4));
        const acct = pad(int(1000000000, 9999999999), 10);
        // Provider-supplied TIN is present most of the time but not always —
        // TIN is the one optional column on the return.
        const supplyTin = rnd() < 0.7;
        await prisma.dataRecord.create({
          data: {
            submissionId: sub.id, providerId: p.id, providerType: p.type as never,
            taxpayerId: t.id,
            accountNumber: enc(acct), accountIndex: idx(acct),
            accountName: t.label,
            ...(t.nin ? { nin: enc(t.nin), ninIndex: idx(t.nin) } : {}),
            bvn: enc(t.bvn), bvnIndex: idx(t.bvn),
            ...(supplyTin ? { tin: enc(t.tin), tinIndex: idx(t.tin) } : {}),
            periodLabel, periodYear: YEAR,
            totalInflow: inflow, totalOutflow: outflow,
            transactionCount: int(12, 900),
            matchMethod: t.nin ? 'NIN' : 'BVN',
            matchConfidence: t.nin ? 0.97 : 0.95,
            payload: { customerType: t.type === 'CORPORATE' ? 'PRIVATE_LIMITED' : 'INDIVIDUAL' },
            flaggedAsUnderdeclared: false,
          } as never,
        });
        accepted++; records++;
      }
      await prisma.dataSubmission.update({
        where: { id: sub.id },
        data: { recordCount: accepted, acceptedCount: accepted } as never,
      });
    }
    console.log('    returns loaded for', p.name);
  }
  console.log('  submissions:', submissions, ' records:', records);

  await prisma.$disconnect();
  console.log('\nDemo tenant ready. Run the scan and the agents to produce cases and signals.');
}

main().catch((e) => { console.error(e); process.exit(1); });
