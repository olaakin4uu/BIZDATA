/**
 * One-shot: run an under-declaration scan for a given year via the real
 * ScanService — WITHOUT bootstrapping the full Nest HTTP app (which pulls in
 * request-scoped JWT strategies that can't init in a standalone context).
 * We wire ScanService + its 4 deps by hand against a PrismaClient (pg adapter).
 *
 * Usage: npx tsx scripts/run-scan.ts <year> [threshold]
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { ScanService } from '../src/modules/scan/scan.service';
import { AuditService } from '../src/common/services/audit.service';
import { StatutoryService } from '../src/modules/statutory/statutory.service';
import { PortfoliosService } from '../src/modules/portfolios/portfolios.service';
import { ReportableService } from '../src/common/services/reportable.service';

async function main() {
  const year = parseInt(process.argv[2] ?? '2026', 10);
  const threshold = process.argv[3] ? parseFloat(process.argv[3]) : undefined;

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) }) as any;

  // Manual DI: every dep bottoms out at prisma (+ audit).
  const audit = new AuditService(prisma);
  const statutory = new StatutoryService(prisma, audit);
  const portfolios = new PortfoliosService(prisma, audit);
  const reportable = new ReportableService(prisma, statutory);
  const scanSvc = new ScanService(prisma, audit, portfolios, statutory, reportable);

  const admin = await prisma.user.findFirst({ where: { role: 'SUPER_ADMIN' }, select: { id: true, email: true } });
  if (!admin) throw new Error('No SUPER_ADMIN user found to attribute the scan to');
  console.log(`Initiating scan for year ${year}${threshold != null ? ` (threshold ${threshold})` : ' (default threshold)'} as ${admin.email}`);

  const scan = await scanSvc.create({ year, threshold }, admin.id);
  console.log(`Scan created: ${scan.id} (status ${scan.status}). Waiting…`);

  for (let i = 0; i < 180; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const row = await prisma.underdeclarationScan.findUnique({ where: { id: scan.id } });
    if (row && row.status !== 'RUNNING') {
      console.log(`\n=== Scan ${row.status} ===`);
      console.log(`Taxpayers scanned:      ${row.totalScanned ?? 0}`);
      console.log(`Flagged cases:          ${row.totalFlagged ?? 0}`);
      console.log(`Est. recoverable tax:   ${row.totalEstimatedTax ?? 0}`);
      if (row.errorMessage) console.log(`Error: ${row.errorMessage}`);
      break;
    }
    if (i % 5 === 0) process.stdout.write(`  …still running (${i * 2}s)\r`);
  }

  await prisma.$disconnect();
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
