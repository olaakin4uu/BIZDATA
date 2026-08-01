import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CryptoService } from '../../common/services/crypto.service';
import { PiiAccessService } from '../../common/services/pii-access.service';
import { ProviderComplianceService } from '../providers/provider-compliance.service';
import {
  DEFAULT_SCHEMAS,
  COMPULSORY_FIELD_ENFORCE_FROM,
  RETURN_COLUMNS,
  RETURN_TEMPLATE_CHANGED_AT,
  type SchemaTemplate,
  type FieldDef,
} from '../submissions/submission-parser';

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
    const row = rows[0] ?? null; // scoped call returns a single row
    if (!row) return null;

    // Formally-issued penalties the regulator has raised against this provider
    // for the year — shown for information so the provider can see what is owed,
    // the statutory basis, and the notice reference. Read-only in the portal.
    const issued = await this.compliance.listPenalties({ providerId, year });
    const issuedTotal = issued.reduce((s, p) => s + Number(p.amount), 0);
    return {
      ...row,
      penalties: {
        // What the regulator has FORMALLY assessed (has a notice ref).
        issued: issued.map((p) => ({
          id: p.id, periodLabel: p.periodLabel, reason: p.reason,
          monthsInDefault: p.monthsInDefault, amount: Number(p.amount),
          status: p.status, noticeRef: p.noticeRef, notifiedAt: p.notifiedAt,
          basis: p.basis,
        })),
        issuedTotal,
        // Accrued-but-not-yet-issued exposure (row.penaltyTotal already computed).
        accruedTotal: row.penaltyTotal,
      },
    };
  }

  /**
   * The CSV upload template for THIS provider's type — the exact schema it must
   * file against (a stored ProviderSchema override if the regulator set one, else
   * the default for the type). Self-documenting: a leading '#' comment block
   * explains every column (required?, type, format rule) so the provider can fill
   * it in without guessing. The comment lines are ignored by the parser on
   * re-upload, so the guidance can be left in place. Followed by the real header
   * row and one illustrative example row.
   */
  async uploadTemplate(providerId: string): Promise<{ fileName: string; csv: string; providerType: string }> {
    const provider = await this.prisma.dataProvider.findUnique({
      where: { id: providerId },
      select: { providerType: true, name: true, reportingFrequency: true },
    });
    if (!provider) throw new NotFoundException('Provider not found');
    const type = provider.providerType as string;

    const stored = await this.prisma.providerSchema.findUnique({ where: { providerType: type as any } });
    const schema: SchemaTemplate = stored
      ? { providerType: type, columns: (stored.columns as any) || DEFAULT_SCHEMAS[type]?.columns || DEFAULT_SCHEMAS.OTHER.columns }
      : DEFAULT_SCHEMAS[type] || DEFAULT_SCHEMAS.OTHER;

    const cols = schema.columns;
    const typeLabel = type.replace(/_/g, ' ');
    const requiredNow = cols.filter((c) => c.required && !c.validation?.enforceFrom).length;
    const softCols = cols.filter((c) => c.required && c.validation?.enforceFrom);

    // Resolve the grace-period enforcement date (config override else schema).
    const enforceDate = await this.resolveFieldEnforcementDate();

    // '#' comment block: a title, a short how-to, then one line per column.
    const guidance: string[] = [
      `# FinData return template — ${typeLabel} provider`,
      `# For: ${provider.name}`,
      `# Reporting frequency: ${(provider.reportingFrequency ?? 'QUARTERLY')} · Period format: ${periodFormatHint(provider.reportingFrequency)}`,
      `#`,
      `# Fill one row per taxpayer/account for the period. Keep the header row (line below this block).`,
      `# The reporting period is NOT a column — you choose it once when you upload, and it is`,
      `#   applied to every row in the file. Submit one file per period.`,
      `# Lines starting with '#' are guidance only and are ignored on upload — you may leave them in or delete them.`,
      `# The example row beneath the header shows the expected format; replace it with your data.`,
    ];
    if (softCols.length) {
      guidance.push(
        `#`,
        `# ⚠ UPCOMING REQUIREMENT: from ${enforceDate}, these fields become mandatory: ${softCols.map((c) => c.name).join(', ')}.`,
        `#   Until then, rows left blank in these fields are still accepted, but flagged with a warning.`,
        `#   Please start populating them now to avoid rejected files after ${enforceDate}.`,
      );
    }
    guidance.push(
      `#`,
      `# Columns (${cols.length} total, ${requiredNow} required now${softCols.length ? `, ${softCols.length} required from ${enforceDate}` : ''}):`,
      ...cols.map((c) => `#   ${c.name} — ${columnSpec(c, enforceDate)}`),
      `#`,
    );

    const header = cols.map((c) => c.name).join(',');
    const example = cols.map((c) => csvCell(exampleValue(c))).join(',');
    const csv = `${guidance.join('\n')}\n${header}\n${example}\n`;
    return { fileName: `bizdata-${type.toLowerCase()}-template.csv`, csv, providerType: type };
  }

  /**
   * The active grace-period enforcement date (YYYY-MM-DD) for phased-in
   * compulsory fields — StatutoryConfig override else the schema default.
   * Exposed so the portal can show a consistent notice everywhere.
   */
  async resolveFieldEnforcementDate(): Promise<string> {
    const cfg = await this.prisma.statutoryConfig.findFirst({
      where: { isActive: true },
      select: { fieldEnforcementDate: true },
    });
    return cfg?.fieldEnforcementDate
      ? cfg.fieldEnforcementDate.toISOString().slice(0, 10)
      : COMPULSORY_FIELD_ENFORCE_FROM;
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
      this.prisma.dataRecord.count({ where: { providerId, NOT: { payload: { path: ['recordKind'], equals: 'ACCOUNT_OPENED' } } } }),
      this.prisma.dataSubmission.count({ where: { providerId, status: 'ACCEPTED' } }),
      this.prisma.dataRecord.count({ where: { providerId, flaggedAsUnderdeclared: true } }),
    ]);

    const recentSubmissions = await this.prisma.dataSubmission.findMany({
      where: { providerId },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    // Standing notice: this provider has not yet filed successfully against the
    // seven-column return, so it is probably still exporting the old, wider
    // format. That format is no longer sufficient — a file missing any of the
    // seven columns is rejected in full — so point them at the new template.
    // Clears itself the moment they file an accepted return under it.
    const filedUnderCurrentFormat = await this.prisma.dataSubmission.count({
      where: { providerId, status: 'ACCEPTED', createdAt: { gte: RETURN_TEMPLATE_CHANGED_AT } },
    });

    return {
      stats: { submissions, records, accepted, flagged },
      unreadNotifications: await this.unreadNotificationCount(providerId),
      recentSubmissions,
      returnFormatNotice: filedUnderCurrentFormat > 0 ? null : {
        changedOn: RETURN_TEMPLATE_CHANGED_AT.toISOString().slice(0, 10),
        columns: RETURN_COLUMNS.map((c) => c.name),
      },
    };
  }

  /**
   * Notifications addressed to THIS institution — overdue-submission reminders,
   * resubmission authorisations, and anything else written with its
   * targetProviderId. Service alerts meant for revenue staff (high-value case
   * flags, §41 deadlines, missing-provider reports) carry no targetProviderId
   * and are never returned here; the staff feed gates them the other way round
   * (NotificationsService.staffVisibility).
   */
  async listNotifications(providerId: string) {
    return this.prisma.notification.findMany({
      where: { targetProviderId: providerId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  /** Unread count for the portal nav badge. */
  async unreadNotificationCount(providerId: string) {
    return this.prisma.notification.count({ where: { targetProviderId: providerId, read: false } });
  }

  /**
   * Mark one of this provider's own notifications read. Scoped by providerId, so
   * knowing another institution's notification id gets you a 404, not a write.
   */
  async markNotificationRead(providerId: string, id: string) {
    const own = await this.prisma.notification.findFirst({
      where: { id, targetProviderId: providerId },
      select: { id: true },
    });
    if (!own) throw new NotFoundException('Notification not found');
    return this.prisma.notification.update({ where: { id }, data: { read: true } });
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

    // ── 1-HOUR ACCESS WINDOW ──
    // A provider can review its submitted data for one hour after submission;
    // after that the data is sealed (the provider holds the source on their side).
    // The receipt/proof of submission remains visible — only the records lock.
    const ONE_HOUR = 60 * 60 * 1000;
    const locked = Date.now() - new Date(submission.receivedAt).getTime() > ONE_HOUR;
    if (locked) {
      const { records: _r, ...meta } = submission;
      return {
        ...meta,
        records: [],
        accessLocked: true,
        lockedMessage:
          'This submission is now sealed. The 1-hour review window after submission has elapsed, so the uploaded records are no longer accessible from the provider portal. Your encrypted submission receipt below is your proof of filing.',
        receiptHash: submission.receiptHash,
      };
    }

    // Providers only ever see MASKED PII in the portal — even for their own
    // submitted data (they hold the source on their side). No reveal path, so no
    // step-up needed. Decrypt-then-mask so the cleartext never leaves the server.
    return {
      ...submission,
      accessLocked: false,
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
  if (n === 'tin') return '12345678-0001';
  if (n === 'rcnumber') return 'RC123456';
  if (n === 'accountnumber') return '0123456788'; // valid NUBAN for bank code 057 (passes check-digit)
  if (n === 'accountname') return 'ADACHI VENTURES LTD';
  if (n === 'customeraddress') return '12 Ahmadu Bello Way, Kano';
  if (n === 'customeremail') return 'accounts@adachiventures.ng';
  if (n === 'customertype') return 'PRIVATE_LIMITED'; // matches the LTD example account name below
  if (n === 'transactiondate') return '2026-03-31';
  if (n === 'transactiondescription') return 'Q1 aggregate account activity';
  if (n === 'currency') return 'NGN';
  if (n === 'conversionrate') return '1.00';
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
  if (n === 'transactiondate') return '2026-03-15';
  if (c.validation?.format === 'date') return '2026-03-15';
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

/**
 * Human-readable spec for one column: required-ness, type, and format rules.
 * `enforceDate` is the resolved grace-period date (from config) shown on
 * soft-required columns.
 */
function columnSpec(c: FieldDef, enforceDate?: string): string {
  // A soft-required column (grace period active) reads as "required from DATE",
  // not a flat REQUIRED — it's accepted-with-warning until then.
  const soft = c.required && !!c.validation?.enforceFrom;
  const parts: string[] = [soft ? 'required soon' : c.required ? 'REQUIRED' : 'optional'];

  // Type / format
  if (c.type === 'decimal') parts.push('number (amount)');
  else if (c.type === 'integer') parts.push('whole number');
  else parts.push('text');

  // Validation rules
  if (c.validation?.length != null) parts.push(`exactly ${c.validation.length} digits`);
  if (c.validation?.min != null) parts.push(`min ${c.validation.min}`);
  if (c.validation?.max != null) parts.push(`max ${c.validation.max}`);
  if (c.validation?.enum) parts.push(`one of: ${c.validation.enum.join(' / ')}`);
  if (c.validation?.format === 'email') parts.push('valid email address');
  if (c.validation?.format === 'date') parts.push('date — YYYY-MM-DD preferred; DD/MM/YYYY also accepted');
  if (c.validation?.format === 'currency') parts.push('3-letter code, e.g. NGN');

  // A friendly hint for well-known columns.
  const hint = COLUMN_HINTS[c.name.toLowerCase()];
  if (hint) parts.push(hint);

  const spec = parts.join(', ');
  if (soft) {
    const when = enforceDate ?? c.validation!.enforceFrom;
    return `${spec} — REQUIRED from ${when}; blank is accepted with a warning until then`;
  }
  return spec;
}

/** Extra plain-language hints for recognised columns (kept in sync with schemas). */
const COLUMN_HINTS: Record<string, string> = {
  periodlabel: 'the reporting period, e.g. 2026-Q1 (quarterly), 2026-03 (monthly) or 2026 (annual)',
  periodquarter: 'alias of periodLabel; e.g. 2026-Q1',
  bvn: 'Bank Verification Number',
  nin: 'National Identity Number',
  accountnumber: '10-digit NUBAN for banks & fintechs; otherwise your own account / wallet / merchant / policy identifier',
  accountname: 'name on the account / policyholder',
  customertype: 'INDIVIDUAL for a natural person, else the CAC class of the organisation — BUSINESS_NAME (BN), PRIVATE_LIMITED (LTD), PUBLIC_LIMITED (PLC), LIMITED_BY_GUARANTEE (LTD/GTE) or INCORPORATED_TRUSTEES (IT)',
  bankcode: 'CBN bank sort code',
  totalinflow: 'total credits into the account for the period (₦)',
  totaloutflow: 'total debits for the period (₦)',
  openingbalance: 'balance at the start of the period (₦)',
  closingbalance: 'balance at the end of the period (₦)',
  transactioncount: 'number of transactions in the period',
  walletid: "the provider's wallet/account identifier",
  merchantid: 'merchant identifier',
  phonenumber: 'MSISDN, e.g. 0803...',
  sector: 'economic sector, e.g. TRADING, HOSPITALITY, TECH',
  businesstype: 'nature of business, e.g. "Retail shop"',
  policynumber: 'insurance policy number',
  sumassured: 'sum assured (₦)',
  residentialstate: 'account holder state of residence',
  accountopeneddate: 'YYYY-MM-DD',
  tin: 'Tax Identification Number — the strongest taxpayer match key; include it whenever you hold it',
  rcnumber: 'CAC registration number for corporate account holders, e.g. RC123456',
  customeraddress: 'account holder / customer address',
  customeremail: 'account holder / customer email',
  transactiondate: 'statement / period date, YYYY-MM-DD',
  transactiondescription: 'free-text narrative or notes for the period',
  currency: 'ISO 4217 code; defaults to NGN if blank',
  conversionrate: 'rate to NGN when currency is not NGN (e.g. 1650.00)',
};

/** Period-format hint driven by the provider's reporting frequency. */
function periodFormatHint(freq: string | null | undefined): string {
  switch ((freq ?? 'QUARTERLY').toUpperCase()) {
    case 'MONTHLY': return 'YYYY-MM (e.g. 2026-03)';
    case 'ANNUAL': return 'YYYY (e.g. 2026)';
    default: return 'YYYY-Qn (e.g. 2026-Q1)';
  }
}

/** Quote a CSV cell if it contains a comma, quote, or newline (RFC-4180). */
function csvCell(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}
