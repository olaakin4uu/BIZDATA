import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { ScanService } from '../scan/scan.service';
import { AgentsService } from '../agents/agents.service';
import { CasesService } from '../cases/cases.service';
import { CryptoService } from '../../common/services/crypto.service';

/**
 * Automates the time-critical parts of the pipeline so they don't depend on an
 * officer clicking a button:
 *   - daily   : enforce §41(6) — dismiss objections the authority let lapse, and
 *               refresh AI-agent signals;
 *   - weekly  : re-run the underdeclaration scan for the current tax year.
 *
 * Gated by SCHEDULER_ENABLED (default on). System-initiated runs are attributed
 * to a system admin and audit-logged by the underlying services.
 */
@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);
  private readonly enabled = process.env.SCHEDULER_ENABLED !== 'false';

  constructor(
    private prisma: PrismaService,
    private scan: ScanService,
    private agents: AgentsService,
    private cases: CasesService,
    private crypto: CryptoService,
  ) {}

  private currentTaxYear(): number {
    return new Date().getFullYear();
  }

  private async systemAdminId(): Promise<string | undefined> {
    const admin = await this.prisma.user.findFirst({
      where: { role: { in: ['SUPER_ADMIN', 'ADMIN'] }, isActive: true },
      select: { id: true },
    });
    return admin?.id;
  }

  @Cron(CronExpression.EVERY_DAY_AT_2AM, { name: 'daily-deadlines' })
  async dailyDeadlines() {
    if (!this.enabled) return;
    const adminId = await this.systemAdminId();
    const { deemedUpheld } = await this.cases.processDeadlines(adminId);
    this.logger.log(`Daily §41(6) sweep: ${deemedUpheld} objection(s) deemed upheld`);
  }

  @Cron(CronExpression.EVERY_DAY_AT_3AM, { name: 'daily-agents' })
  async dailyAgents() {
    if (!this.enabled) return;
    const adminId = await this.systemAdminId();
    const r = await this.agents.run(this.currentTaxYear(), adminId);
    this.logger.log(`Daily agent run: ${r.signals} signals over ${r.profiles} taxpayers`);
  }

  @Cron(CronExpression.EVERY_DAY_AT_1AM, { name: 'daily-key-rotation-check' })
  async dailyKeyRotationCheck() {
    if (!this.enabled) return;
    const status = this.crypto.rotationStatus();
    if (status.rotationDue) {
      this.logger.warn(
        `PII encryption key "${status.activeKeyId}" is ${status.activeKeyAgeDays} days old (≥90) — rotation is due. Provision a new PII_ENC_KEY_N, point PII_ENC_ACTIVE_KEY_ID at it, and run the re-encryption migration.`,
      );
    }
  }

  @Cron(CronExpression.EVERY_WEEK, { name: 'weekly-scan' })
  async weeklyScan() {
    if (!this.enabled) return;
    const adminId = await this.systemAdminId();
    if (!adminId) return;
    await this.scan.create({ year: this.currentTaxYear() }, adminId);
    this.logger.log(`Weekly scan queued for ${this.currentTaxYear()}`);
  }

  /** On-demand: run the full automated batch now (for a given year). */
  async runNow(year: number, staffId?: string) {
    const adminId = staffId ?? (await this.systemAdminId());
    const scan = await this.scan.create({ year }, adminId!);
    const agents = await this.agents.run(year, adminId);
    const deadlines = await this.cases.processDeadlines(adminId);
    return { year, scanId: scan.id, agentSignals: agents.signals, deemedUpheld: deadlines.deemedUpheld };
  }
}
