/**
 * One-shot: run an under-declaration scan for a given year via the real
 * ScanService (same engine the UI triggers), without needing a staff login.
 *
 * Usage: npx tsx scripts/run-scan.ts <year> [threshold]
 */
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { ScanService } from '../src/modules/scan/scan.service';
import { PrismaService } from '../src/prisma/prisma.service';

async function main() {
  const year = parseInt(process.argv[2] ?? '2026', 10);
  const threshold = process.argv[3] ? parseFloat(process.argv[3]) : undefined;

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn', 'log'] });
  const scanSvc = app.get(ScanService);
  const prisma = app.get(PrismaService);

  // Use a real SUPER_ADMIN staff id as the scan initiator (audit trail).
  const admin = await prisma.user.findFirst({ where: { role: 'SUPER_ADMIN' }, select: { id: true, email: true } });
  if (!admin) throw new Error('No SUPER_ADMIN user found to attribute the scan to');
  console.log(`Initiating scan for year ${year}${threshold != null ? ` (threshold ${threshold})` : ' (default threshold)'} as ${admin.email}`);

  const scan = await scanSvc.create({ year, threshold }, admin.id);
  console.log(`Scan created: ${scan.id} (status ${scan.status}). Waiting for it to finish…`);

  // create() runs the scan async via setImmediate; poll the row until it completes.
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

  await app.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
