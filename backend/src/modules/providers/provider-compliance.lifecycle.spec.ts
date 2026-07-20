import { NotFoundException } from '@nestjs/common';
import { ProviderComplianceService } from './provider-compliance.service';

/**
 * Lifecycle tests for the NTAA §101 provider-penalty flow: issue → serve
 * (NOTIFIED) → idempotency → effective-date gating → resolved-record protection.
 * The service is exercised with hand-rolled mocks of its three deps (prisma,
 * statutory, audit) so the tests are fast, deterministic and DB-free.
 */

const CFG = {
  version: 7,
  reportingDueDays: 15,
  providerPenaltyFirstMonth: 100_000,
  providerPenaltyPerMonth: 50_000,
  providerPenaltyPaymentDays: 30,
  providerPenaltyEffectiveFrom: null as string | null,
};

// A provider that is MONTHLY so the year yields month periods; we override the
// submission set per test to drive ON_TIME / LATE / MISSING.
function makeMocks(opts: {
  effectiveFrom?: string | null;
  submissions?: any[];            // dataSubmission rows for the provider
  existingPenalty?: any | null;   // providerPenalty.findUnique result
  frequency?: string;
} = {}) {
  const cfg = { ...CFG, providerPenaltyEffectiveFrom: opts.effectiveFrom ?? null };
  const auditCalls: any[] = [];
  const upserts: any[] = [];
  const updates: any[] = [];

  const prisma: any = {
    dataProvider: {
      findUnique: jest.fn().mockResolvedValue({ id: 'prov1', name: 'Zenith Bank' }),
      findMany: jest.fn().mockResolvedValue([
        { id: 'prov1', name: 'Zenith Bank', providerType: 'BANK', reportingFrequency: opts.frequency ?? 'MONTHLY', status: 'ACTIVE' },
      ]),
    },
    dataSubmission: {
      findMany: jest.fn().mockResolvedValue(opts.submissions ?? []),
    },
    providerPenalty: {
      findUnique: jest.fn().mockResolvedValue(opts.existingPenalty ?? null),
      upsert: jest.fn().mockImplementation((args: any) => {
        upserts.push(args);
        // Emulate Prisma: existing → update branch, else create branch.
        const isUpdate = !!opts.existingPenalty;
        const base = isUpdate ? args.update : args.create;
        return Promise.resolve({ id: 'pen1', ...base });
      }),
      update: jest.fn().mockImplementation((args: any) => { updates.push(args); return Promise.resolve({ id: args.where.id, ...args.data }); }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    tenant: { findFirst: jest.fn().mockResolvedValue({ name: 'KIRS', shortName: 'KIRS' }) },
    user: { findUnique: jest.fn().mockResolvedValue({ firstName: 'Ada', lastName: 'Obi', role: 'ADMIN' }) },
  };
  const statutory: any = { active: jest.fn().mockResolvedValue(cfg) };
  const audit: any = { log: jest.fn().mockImplementation((c: any) => { auditCalls.push(c); return Promise.resolve(); }) };

  const svc = new ProviderComplianceService(prisma, statutory, audit);
  return { svc, prisma, auditCalls, upserts, updates };
}

// "now" is mid-2026 for these tests; a 2025 monthly period is long overdue.
const REAL_NOW = Date;

describe('issuePenalty — happy path (MISSING)', () => {
  it('creates an ASSESSED penalty with the §101 amount and a notice ref, and audits it', async () => {
    // No submissions → every past 2025 month is MISSING.
    const { svc, prisma, auditCalls, upserts } = makeMocks({ submissions: [] });
    const saved = await svc.issuePenalty('prov1', '2025-01', 'staff1');

    expect(prisma.providerPenalty.upsert).toHaveBeenCalledTimes(1);
    const created = upserts[0].create;
    expect(created.status).toBe('ASSESSED');
    expect(created.reason).toBe('MISSING');
    expect(Number(created.amount)).toBeGreaterThan(0);
    expect(String(created.noticeRef)).toMatch(/^PPN-2025-01-[0-9A-F]{6}$/);
    expect(saved).toBeTruthy();
    expect(auditCalls.some((c) => c.action === 'ISSUE_PROVIDER_PENALTY')).toBe(true);
  });
});

describe('issuePenalty — rejections', () => {
  it('rejects an unknown provider', async () => {
    const { svc, prisma } = makeMocks();
    prisma.dataProvider.findUnique.mockResolvedValueOnce(null);
    await expect(svc.issuePenalty('nope', '2025-01')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects a period that is not in default (ON_TIME)', async () => {
    // A submission received before the due date makes 2025-01 ON_TIME.
    const onTime = [{ providerId: 'prov1', periodLabel: '2025-01', status: 'ACCEPTED', receivedAt: new Date('2025-02-10T00:00:00Z'), recordCount: 1, acceptedCount: 1, rejectedCount: 0 }];
    const { svc } = makeMocks({ submissions: onTime });
    await expect(svc.issuePenalty('prov1', '2025-01')).rejects.toThrow(/no penalty is due/i);
  });

  it('rejects a period whose due date precedes the penalty commencement date', async () => {
    // Effective from 2026-01-01: a 2025-01 period (due 2025-02) is before it.
    const { svc } = makeMocks({ submissions: [], effectiveFrom: '2026-01-01' });
    await expect(svc.issuePenalty('prov1', '2025-01')).rejects.toThrow(/commencement date/i);
  });
});

describe('issuePenalty — resolved-record protection', () => {
  it('leaves a WAIVED penalty untouched (no upsert, returns existing)', async () => {
    const { svc, prisma } = makeMocks({ submissions: [], existingPenalty: { id: 'pen1', status: 'WAIVED' } });
    const res = await svc.issuePenalty('prov1', '2025-01');
    expect(prisma.providerPenalty.upsert).not.toHaveBeenCalled();
    expect(res).toEqual({ id: 'pen1', status: 'WAIVED' });
  });

  it('leaves a PAID penalty untouched', async () => {
    const { svc, prisma } = makeMocks({ submissions: [], existingPenalty: { id: 'pen1', status: 'PAID' } });
    await svc.issuePenalty('prov1', '2025-01');
    expect(prisma.providerPenalty.upsert).not.toHaveBeenCalled();
  });
});

describe('issuePenalty — re-issue of a NOTIFIED penalty (idempotency)', () => {
  it('refreshes figures via the update branch WITHOUT changing the served notice ref', async () => {
    // A penalty already served (NOTIFIED) with a known ref. A rescan re-issues.
    const existing = { id: 'pen1', status: 'NOTIFIED', noticeRef: 'PPN-2025-01-ABC123' };
    const { svc, prisma, upserts } = makeMocks({ submissions: [], existingPenalty: existing });
    await svc.issuePenalty('prov1', '2025-01');

    expect(prisma.providerPenalty.upsert).toHaveBeenCalledTimes(1);
    const update = upserts[0].update;
    // The update must NOT reset status (status is not in the payload → preserved).
    expect(update.status).toBeUndefined();
    // A served penalty's notice reference must remain stable — the letter already
    // cites it. The update payload must NOT include noticeRef, so the existing DB
    // value is left untouched (noticeRef is minted once, create-only).
    expect(update.noticeRef).toBeUndefined();
    // The create branch is where the ref is minted (only used on first assessment).
    expect(upserts[0].create.noticeRef).toMatch(/^PPN-2025-01-[0-9A-F]{6}$/);
    // Figures DO refresh (e.g. accrued months).
    expect(update.amount).toBeDefined();
  });
});

describe('penaltyNotice — serving transitions ASSESSED → NOTIFIED once', () => {
  it('marks an ASSESSED penalty NOTIFIED and audits the service', async () => {
    const { svc, prisma, auditCalls } = makeMocks();
    prisma.providerPenalty.findUnique.mockResolvedValueOnce({
      id: 'pen1', status: 'ASSESSED', providerId: 'prov1', periodLabel: '2025-01', periodYear: 2025,
      dueAt: new Date('2025-02-15T00:00:00Z'), reason: 'MISSING', monthsInDefault: 18,
      firstMonthAmount: '100000', perMonthAmount: '50000', amount: '950000',
      statutoryVersion: 7, noticeRef: 'PPN-2025-01-ABC123',
      provider: { name: 'Zenith Bank', providerType: 'BANK', contactEmail: 'c@z.ng', address: 'Lagos' },
    });
    const html = await svc.penaltyNotice('pen1', { id: 'staff1', email: 's@k.ng' });

    expect(prisma.providerPenalty.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'pen1' }, data: expect.objectContaining({ status: 'NOTIFIED' }) }),
    );
    expect(auditCalls.some((c) => c.action === 'SERVE_PROVIDER_PENALTY_NOTICE')).toBe(true);
    expect(html).toContain('PPN-2025-01-ABC123');
    expect(html).toContain('YOU ARE HEREBY REQUIRED');
  });

  it('does NOT re-transition an already NOTIFIED penalty (no status update)', async () => {
    const { svc, prisma } = makeMocks();
    prisma.providerPenalty.findUnique.mockResolvedValueOnce({
      id: 'pen1', status: 'NOTIFIED', providerId: 'prov1', periodLabel: '2025-01', periodYear: 2025,
      dueAt: new Date('2025-02-15T00:00:00Z'), reason: 'MISSING', monthsInDefault: 18,
      firstMonthAmount: '100000', perMonthAmount: '50000', amount: '950000',
      statutoryVersion: 7, noticeRef: 'PPN-2025-01-ABC123',
      provider: { name: 'Zenith Bank', providerType: 'BANK', contactEmail: null, address: null },
    });
    await svc.penaltyNotice('pen1', { id: 'staff1' });
    expect(prisma.providerPenalty.update).not.toHaveBeenCalled();
  });

  it('rejects an unknown penalty id', async () => {
    const { svc, prisma } = makeMocks();
    prisma.providerPenalty.findUnique.mockResolvedValueOnce(null);
    await expect(svc.penaltyNotice('nope', { id: 'staff1' })).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('effective-date gating in forYear', () => {
  it('zeroes the penalty for periods due before the commencement date', async () => {
    // Effective 2026-02-01 — AFTER every 2025 monthly due date (note 2025-12 is
    // due 2026-01-15, so a 2026-01-01 date would still let December through; we
    // use 2026-02-01 to exclude the whole 2025 book). All months are pre-commencement.
    const { svc } = makeMocks({ submissions: [], effectiveFrom: '2026-02-01', frequency: 'MONTHLY' });
    const rows = await svc.forYear(2025, 'prov1');
    const total = rows[0].penaltyTotal;
    expect(total).toBe(0);
    // Every in-default period should be flagged not-enforced.
    const defaults = rows[0].periods.filter((p) => p.status === 'MISSING' || p.status === 'LATE');
    expect(defaults.length).toBeGreaterThan(0);
    expect(defaults.every((p) => p.penaltyEnforced === false)).toBe(true);
  });

  it('applies the penalty when no commencement date is set', async () => {
    const { svc } = makeMocks({ submissions: [], effectiveFrom: null, frequency: 'MONTHLY' });
    const rows = await svc.forYear(2025, 'prov1');
    expect(rows[0].penaltyTotal).toBeGreaterThan(0);
  });
});
