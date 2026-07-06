import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CryptoService } from '../../common/services/crypto.service';
import { PiiAccessService } from '../../common/services/pii-access.service';
import { ProviderComplianceService } from '../providers/provider-compliance.service';
import { DEFAULT_SCHEMAS, type SchemaTemplate, type FieldDef } from '../submissions/submission-parser';

@Injectable()
export class ProviderPortalService {
  constructor(
    private prisma: PrismaService,
    private crypto: CryptoService,
    private pii: PiiAccessService,
    private compliance: ProviderComplianceService,
  ) {}

  /**
   * The provider's own §29 filing calendar for a year: expected periods, their
   * statutory due dates, and per-period status (ON_TIME / LATE / MISSING /
   * PENDING). Reuses the same computation the regulator sees, scoped to this
   * provider only.
   */
  async complianceForYear(providerId: string, year: number) {
    const rows = await this.compliance.forYear(year, providerId);
    return rows[0] ?? null; // scoped call returns a single row
  }

  /**
   * The CSV upload template for THIS provider's type — the exact schema it must
   * file against (a stored ProviderSchema override if the regulator set one, else
   * the default for the type). Returns the header row plus one illustrative row,
   * with a matching filename.
   */
  async uploadTemplate(providerId: string): Promise<{ fileName: string; csv: string; providerType: string }> {
    const provider = await this.prisma.dataProvider.findUnique({
      where: { id: providerId },
      select: { providerType: true },
    });
    if (!provider) throw new NotFoundException('Provider not found');
    const type = provider.providerType as string;

    const stored = await this.prisma.providerSchema.findUnique({ where: { providerType: type as any } });
    const schema: SchemaTemplate = stored
      ? { providerType: type, columns: (stored.columns as any) || DEFAULT_SCHEMAS[type]?.columns || DEFAULT_SCHEMAS.OTHER.columns }
      : DEFAULT_SCHEMAS[type] || DEFAULT_SCHEMAS.OTHER;

    const cols = schema.columns;
    const header = cols.map((c) => c.name).join(',');
    const example = cols.map((c) => csvCell(exampleValue(c))).join(',');
    const csv = `${header}\n${example}\n`;
    return { fileName: `bizdata-${type.toLowerCase()}-template.csv`, csv, providerType: type };
  }

  async me(id: string) {
    const user = await this.prisma.dataProviderUser.findUnique({
      where: { id },
      include: { provider: true },
    });
    if (!user) throw new NotFoundException();
    const { passwordHash: _, ...rest } = user;
    return rest;
  }

  async dashboard(providerId: string) {
    const [submissions, records, accepted, flagged] = await Promise.all([
      this.prisma.dataSubmission.count({ where: { providerId } }),
      this.prisma.dataRecord.count({ where: { providerId } }),
      this.prisma.dataSubmission.count({ where: { providerId, status: 'ACCEPTED' } }),
      this.prisma.dataRecord.count({ where: { providerId, flaggedAsUnderdeclared: true } }),
    ]);

    const recentSubmissions = await this.prisma.dataSubmission.findMany({
      where: { providerId },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    return {
      stats: { submissions, records, accepted, flagged },
      recentSubmissions,
    };
  }

  async listSubmissions(providerId: string, query: any) {
    const page = Math.max(1, parseInt(query.page || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(query.limit || '20', 10)));
    const where = { providerId, ...(query.status ? { status: query.status } : {}) };
    const [submissions, total] = await Promise.all([
      this.prisma.dataSubmission.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.dataSubmission.count({ where }),
    ]);
    return { submissions, total, page, limit };
  }

  async getSubmission(providerId: string, id: string) {
    const submission = await this.prisma.dataSubmission.findFirst({
      where: { id, providerId },
      include: {
        records: {
          take: 50,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true, accountNumber: true, bvn: true, accountName: true,
            periodLabel: true, totalInflow: true, flaggedAsUnderdeclared: true,
          },
        },
      },
    });
    if (!submission) throw new NotFoundException('Submission not found');
    // Providers only ever see MASKED PII in the portal — even for their own
    // submitted data (they hold the source on their side). No reveal path, so no
    // step-up needed. Decrypt-then-mask so the cleartext never leaves the server.
    return {
      ...submission,
      records: submission.records.map((r) => ({
        ...r,
        accountNumber: this.pii.mask(this.crypto.decrypt(r.accountNumber), 'account'),
        bvn: this.pii.mask(this.crypto.decrypt(r.bvn), 'bvn'),
      })),
    };
  }
}

/** An illustrative sample value for a schema column, used in the CSV template. */
function exampleValue(c: FieldDef): string {
  const n = c.name.toLowerCase();
  if (n === 'periodlabel' || n === 'periodquarter') return `${new Date().getUTCFullYear()}-Q1`;
  if (n === 'bvn') return '22212345678';
  if (n === 'nin') return '12345678901';
  if (n === 'accountnumber') return '0123456789';
  if (n === 'accountname') return 'ADACHI VENTURES LTD';
  if (n === 'bankcode') return '057';
  if (n === 'bankname') return 'Example Bank';
  if (n === 'sector') return 'TRADING';
  if (n === 'businesstype') return 'Retail shop';
  if (n === 'walletid') return 'WAL-000123';
  if (n === 'merchantid') return 'MER-000123';
  if (n === 'phonenumber') return '08030000000';
  if (n === 'residentialstate') return 'Kano';
  if (n === 'accounttype') return 'CURRENT';
  if (n === 'accountopeneddate') return '2021-03-15';
  if (n === 'reportingbranch') return 'Kano Main';
  if (c.type === 'decimal') {
    if (n.includes('opening')) return '10000';
    if (n.includes('closing')) return '60000';
    if (n.includes('outflow')) return '50000';
    return '100000';
  }
  if (c.type === 'integer') return '12';
  return 'value';
}

/** Quote a CSV cell if it contains a comma, quote, or newline (RFC-4180). */
function csvCell(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}
