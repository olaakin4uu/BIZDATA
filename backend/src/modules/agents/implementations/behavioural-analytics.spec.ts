import { BehaviouralAnalyticsAgent } from './behavioural-analytics.agent';
import type { TaxpayerProfile, ProfileRecord, AgentContext } from '../agent.types';

/**
 * Guards against the agent asserting more than the data supports.
 *
 * All three cases below were live defects found on a real signal: a taxpayer
 * with ₦2,205 in Q1 and ₦131.9m in Q2 was described as "second half 100%
 * higher", as having a "new high-value counter-party (f4ee7e20-…)", and as
 * running a pass-through account — the last on records that carried no balance
 * figures at all.
 */

const ctx = {} as AgentContext;

function rec(over: Partial<ProfileRecord>): ProfileRecord {
  return {
    providerId: 'prov-a', providerType: 'BANK', providerName: 'Example Bank',
    periodLabel: '2026-Q1', periodYear: 2026,
    totalInflow: 0, totalOutflow: 0, openingBalance: 0, closingBalance: 0,
    hasBalances: false, transactionCount: 1, matchConfidence: 0.95,
    accountName: 'A N OTHER', accountNumber: '0123456788', bvn: null, payload: null,
    ...over,
  };
}

function profile(records: ProfileRecord[], over: Partial<TaxpayerProfile> = {}): TaxpayerProfile {
  return {
    taxpayerId: 'tp-1', type: 'INDIVIDUAL', year: 2026,
    firstName: 'WEIYA', lastName: 'ZHANG', businessName: null,
    dateOfBirth: null, stateOfResidence: 'Kano', sector: null,
    records,
    totalInflow: records.reduce((s, r) => s + r.totalInflow, 0),
    totalOutflow: records.reduce((s, r) => s + r.totalOutflow, 0),
    transactionCount: records.length,
    providerCount: new Set(records.map((r) => r.providerId)).size,
    declaredIncome: 0, hasDeclaration: false,
    ...over,
  };
}

const agent = new BehaviouralAnalyticsAgent();

describe('behavioural agent — never claims pass-through without balances', () => {
  const noBalances = [
    rec({ periodLabel: '2026-Q1', totalInflow: 54_576_000 }),
    rec({ periodLabel: '2026-Q2', totalInflow: 131_871_838 }),
  ];

  it('omits the pass-through sentence when no record carried balances', () => {
    const sig = agent.analyze(profile(noBalances), ctx)!;
    expect(sig).not.toBeNull();
    expect(sig.summary).not.toMatch(/pass-through/i);
  });

  it('excludes the pass-through component from the score entirely', () => {
    const sig = agent.analyze(profile(noBalances), ctx)!;
    // It may still be computed for transparency, but must not have been blended:
    // with balances absent the only usable components are trend and volatility.
    expect((sig.details as any).fingerprint.balanceRetentionRatio).toBe(0);
  });

  it('DOES report pass-through when balances were genuinely reported and flat', () => {
    const withBalances = [
      rec({ periodLabel: '2026-Q1', totalInflow: 50_000_000, hasBalances: true, openingBalance: 1_000, closingBalance: 1_000 }),
      rec({ periodLabel: '2026-Q2', totalInflow: 120_000_000, hasBalances: true, openingBalance: 1_000, closingBalance: 1_200 }),
    ];
    const sig = agent.analyze(profile(withBalances), ctx)!;
    expect(sig.summary).toMatch(/pass-through/i);
  });
});

describe('behavioural agent — reports the trend honestly', () => {
  it('quotes both halves rather than a bare percentage', () => {
    const sig = agent.analyze(profile([
      rec({ periodLabel: '2026-Q1', totalInflow: 54_576_000 }),
      rec({ periodLabel: '2026-Q2', totalInflow: 131_871_838 }),
    ]), ctx)!;
    expect(sig.summary).toMatch(/₦54\.58m → ₦131\.87m/);
  });

  it('flags a near-zero baseline instead of presenting it as a 100% rise', () => {
    const sig = agent.analyze(profile([
      rec({ periodLabel: '2026-Q1', totalInflow: 2_204.94 }),
      rec({ periodLabel: '2026-Q2', totalInflow: 131_871_838 }),
    ]), ctx)!;
    expect(sig.summary).toMatch(/negligible next to the second/i);
  });

  it('does not add that caveat when both halves are substantial', () => {
    const sig = agent.analyze(profile([
      rec({ periodLabel: '2026-Q1', totalInflow: 54_576_000 }),
      rec({ periodLabel: '2026-Q2', totalInflow: 131_871_838 }),
    ]), ctx)!;
    expect(sig.summary).not.toMatch(/negligible/i);
  });
});

describe('behavioural agent — names the institution, and calls it what it is', () => {
  const lateEntrant = [
    rec({ providerId: 'prov-a', providerName: 'Stanbic IBTC', periodLabel: '2026-Q1', totalInflow: 2_204 }),
    rec({ providerId: 'prov-b', providerName: 'United Bank for Africa', periodLabel: '2026-Q2', totalInflow: 131_871_838 }),
  ];

  it('prints the provider name, never a raw uuid', () => {
    const sig = agent.analyze(profile(lateEntrant), ctx)!;
    expect(sig.summary).toContain('United Bank for Africa');
    expect(sig.summary).not.toContain('prov-b');
  });

  it('keeps the id in details for machine use', () => {
    const sig = agent.analyze(profile(lateEntrant), ctx)!;
    expect((sig.details as any).fingerprint.newHighValueProvider).toBe('prov-b');
    expect((sig.details as any).fingerprint.newHighValueProviderName).toBe('United Bank for Africa');
  });

  it('does not call the reporting bank a counter-party', () => {
    const sig = agent.analyze(profile(lateEntrant), ctx)!;
    // §29 returns carry no counter-party at all — claiming one overstates what
    // the authority can see.
    expect(sig.summary).not.toMatch(/counter-party/i);
  });
});

describe('behavioural agent — no volatility claim from two points', () => {
  it('stays silent on irregularity with only two periods', () => {
    const sig = agent.analyze(profile([
      rec({ periodLabel: '2026-Q1', totalInflow: 2_204 }),
      rec({ periodLabel: '2026-Q2', totalInflow: 131_871_838 }),
    ]), ctx)!;
    expect(sig.summary).not.toMatch(/coefficient of variation/i);
  });

  it('reports irregularity once there are three or more periods', () => {
    const sig = agent.analyze(profile([
      rec({ periodLabel: '2026-Q1', totalInflow: 1_000_000 }),
      rec({ periodLabel: '2026-Q2', totalInflow: 90_000_000 }),
      rec({ periodLabel: '2026-Q3', totalInflow: 2_000_000 }),
      rec({ periodLabel: '2026-Q4', totalInflow: 120_000_000 }),
    ]), ctx)!;
    expect(sig.summary).toMatch(/coefficient of variation/i);
  });
});
