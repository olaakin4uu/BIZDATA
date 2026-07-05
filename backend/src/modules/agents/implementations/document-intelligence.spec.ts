import {
  parseNgnAmount,
  extractFinancials,
  reconcile,
  computeCgt,
  scoreReconciliation,
} from './document-intelligence.agent';

describe('parseNgnAmount', () => {
  it('parses plain and comma-separated amounts', () => {
    expect(parseNgnAmount('1200000')).toBe(1_200_000);
    expect(parseNgnAmount('1,200,000')).toBe(1_200_000);
    expect(parseNgnAmount('1,250,000.75')).toBe(1_250_000.75);
  });

  it('strips currency markers (₦, N, NGN)', () => {
    expect(parseNgnAmount('₦1,200,000')).toBe(1_200_000);
    expect(parseNgnAmount('N1,200,000')).toBe(1_200_000);
    expect(parseNgnAmount('NGN 1,200,000')).toBe(1_200_000);
  });

  it('applies magnitude suffixes k/m/bn', () => {
    expect(parseNgnAmount('950k')).toBe(950_000);
    expect(parseNgnAmount('1.2m')).toBe(1_200_000);
    expect(parseNgnAmount('2.5bn')).toBe(2_500_000_000);
    expect(parseNgnAmount('2.5b')).toBe(2_500_000_000);
  });

  it('returns null for junk / empty', () => {
    expect(parseNgnAmount('')).toBeNull();
    expect(parseNgnAmount('abc')).toBeNull();
    expect(parseNgnAmount('N/A')).toBeNull();
  });
});

describe('extractFinancials', () => {
  it('pulls declared income, expenses, and disposals from labelled OCR text', () => {
    const text = [
      'STATEMENT OF ACCOUNTS 2026',
      'Total Income: N4,500,000,000',
      'Operating Expenses: N1,200,000,000',
      'Proceeds from sale of assets: N800,000,000',
    ].join('\n');
    const r = extractFinancials(text);
    expect(r.declaredIncome).toBe(4_500_000_000);
    expect(r.expenses).toBe(1_200_000_000);
    expect(r.assetDisposals).toBe(800_000_000);
  });

  it('recognises income synonyms', () => {
    expect(extractFinancials('Turnover: 5,000,000').declaredIncome).toBe(5_000_000);
    expect(extractFinancials('Gross Income 3.2m').declaredIncome).toBe(3_200_000);
    expect(extractFinancials('Assessable Income: NGN 900,000').declaredIncome).toBe(900_000);
  });

  it('omits fields it cannot find', () => {
    const r = extractFinancials('Total Income: 1,000,000');
    expect(r.declaredIncome).toBe(1_000_000);
    expect(r.assetDisposals).toBeUndefined();
    expect(r.expenses).toBeUndefined();
  });

  it('handles empty / non-string input', () => {
    expect(extractFinancials('')).toEqual({});
    expect(extractFinancials(null as any)).toEqual({});
  });
});

describe('reconcile', () => {
  it('flags consistent when declared within ±15% of observed', () => {
    const r = reconcile({ declaredIncome: 1_000_000 }, 1_050_000);
    expect(r.consistent).toBe(true);
    expect(r.variance).toBeCloseTo(-0.0476, 3);
  });

  it('flags a variance when declared is far below observed (under-declaration)', () => {
    const r = reconcile({ declaredIncome: 4_500_000_000 }, 7_040_310_000);
    expect(r.consistent).toBe(false);
    expect(r.variance).toBeLessThan(0);
    expect(r.note).toContain('below');
  });

  it('handles missing declared income', () => {
    const r = reconcile({}, 1_000_000);
    expect(r.consistent).toBe(false);
    expect(r.variance).toBe(0);
    expect(r.note).toMatch(/no declared income/i);
  });

  it('handles zero observed inflow', () => {
    expect(reconcile({ declaredIncome: 0 }, 0).consistent).toBe(true);
    expect(reconcile({ declaredIncome: 500_000 }, 0).consistent).toBe(false);
  });
});

describe('computeCgt (NTA §50)', () => {
  it('assesses CGT on disposal proceeds at the configured rate', () => {
    const cgt = computeCgt({ assetDisposals: 800_000_000 }, 0.1);
    expect(cgt).not.toBeNull();
    expect(cgt!.proceeds).toBe(800_000_000);
    expect(cgt!.rate).toBe(0.1);
    expect(cgt!.cgt).toBe(80_000_000);
    expect(cgt!.note).toMatch(/CGT assessed at 10%/);
  });

  it('returns null when there is no disposal', () => {
    expect(computeCgt({}, 0.1)).toBeNull();
    expect(computeCgt({ assetDisposals: 0 }, 0.1)).toBeNull();
    expect(computeCgt({ declaredIncome: 1_000_000 }, 0.1)).toBeNull();
  });

  it('falls back to 10% when given a non-positive rate', () => {
    const cgt = computeCgt({ assetDisposals: 1_000_000 }, 0);
    expect(cgt!.rate).toBe(0.1);
    expect(cgt!.cgt).toBe(100_000);
  });

  it('respects a different configured rate', () => {
    const cgt = computeCgt({ assetDisposals: 1_000_000 }, 0.2);
    expect(cgt!.cgt).toBe(200_000);
  });
});

describe('scoreReconciliation', () => {
  it('scores under-declaration as concerning and over-declaration as not', () => {
    const under = scoreReconciliation(reconcile({ declaredIncome: 100_000 }, 1_000_000));
    const over = scoreReconciliation(reconcile({ declaredIncome: 2_000_000 }, 1_000_000));
    expect(under.score).toBeGreaterThan(0);
    expect(over.score).toBe(0);
  });
});
