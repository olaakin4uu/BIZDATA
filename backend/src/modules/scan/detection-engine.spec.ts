import {
  progressivePit,
  estimateAdditionalTax,
  isLlcName,
  normalizeInflow,
  scoreCase,
  confidenceToRisk,
  aggregateAgentScore,
  compositeConfidence,
  PIT_BANDS,
  CIT_RATE,
} from './detection-engine';

describe('progressivePit', () => {
  it('is zero below the tax-free threshold', () => {
    expect(progressivePit(0)).toBe(0);
    expect(progressivePit(800_000)).toBe(0);
    expect(progressivePit(-100)).toBe(0);
  });

  it('taxes only the slice above ₦800k at 15%', () => {
    // 1,000,000 → (1,000,000 − 800,000) × 15% = 30,000
    expect(progressivePit(1_000_000)).toBeCloseTo(30_000, 2);
  });

  it('applies marginal bands across boundaries', () => {
    // 3,000,000 → (3,000,000 − 800,000) × 15% = 330,000
    expect(progressivePit(3_000_000)).toBeCloseTo(330_000, 2);
    // 12,000,000 → 330,000 + (12,000,000 − 3,000,000) × 18% = 330,000 + 1,620,000
    expect(progressivePit(12_000_000)).toBeCloseTo(1_950_000, 2);
  });

  it('is monotonic — more income never means less tax', () => {
    let prev = -1;
    for (const inc of [0, 800_000, 2_000_000, 10_000_000, 40_000_000, 100_000_000]) {
      const t = progressivePit(inc);
      expect(t).toBeGreaterThanOrEqual(prev);
      prev = t;
    }
  });
});

describe('isLlcName', () => {
  it('matches trailing LTD / Limited / PLC, with or without a full stop', () => {
    for (const n of ['Acme Ltd', 'Acme Ltd.', 'ACME LIMITED', 'Acme (Nigeria) PLC', 'Foo plc']) {
      expect(isLlcName(n)).toBe(true);
    }
  });
  it('does not match individuals, enterprises or lookalike words', () => {
    for (const n of ['John Doe', 'Acme Ventures', 'Bright Enterprises', 'Unlimited Stores', 'Limitless Foods', null, undefined, '']) {
      expect(isLlcName(n as any)).toBe(false);
    }
  });
});

describe('estimateAdditionalTax', () => {
  it('limited companies are NOT income-assessed by the state (CIT is federal)', () => {
    const e = estimateAdditionalTax({ taxpayerType: 'CORPORATE', declaredIncome: 20_000_000, observedIncome: 120_000_000, isLimitedLiability: true });
    expect(e.assessed).toBe(false);
    expect(e.tax).toBe(0);
    expect(e.basis).toBe('NOT_ASSESSED_LLC');
    expect(e.flatTax).toBeNull();
  });

  it('is zero when observed does not exceed declared', () => {
    expect(estimateAdditionalTax({ taxpayerType: 'INDIVIDUAL', declaredIncome: 5_000_000, observedIncome: 5_000_000 }).tax).toBe(0);
    expect(estimateAdditionalTax({ taxpayerType: 'INDIVIDUAL', declaredIncome: 5_000_000, observedIncome: 4_000_000 }).tax).toBe(0);
  });

  it('individuals: marginal graduated PIT on the gap', () => {
    const e = estimateAdditionalTax({ taxpayerType: 'INDIVIDUAL', declaredIncome: 1_000_000, observedIncome: 3_000_000 });
    expect(e.assessed).toBe(true);
    expect(e.basis).toBe('PIT_GRADUATED');
    expect(e.tax).toBeCloseTo(progressivePit(3_000_000) - progressivePit(1_000_000), 2);
  });

  it('non-LLC corporates (enterprises) are graduated like individuals — not flat CIT', () => {
    const e = estimateAdditionalTax({ taxpayerType: 'CORPORATE', declaredIncome: 1_000_000, observedIncome: 3_000_000, isLimitedLiability: false });
    expect(e.assessed).toBe(true);
    expect(e.basis).toBe('PIT_GRADUATED');
    expect(e.tax).toBeCloseTo(progressivePit(3_000_000) - progressivePit(1_000_000), 2);
  });

  it('also returns a flat-rate comparison on the gap (default = CIT rate)', () => {
    const e = estimateAdditionalTax({ taxpayerType: 'INDIVIDUAL', declaredIncome: 20_000_000, observedIncome: 120_000_000 });
    expect(e.flatRate).toBeCloseTo(CIT_RATE, 5);
    expect(e.flatTax).toBeCloseTo((120_000_000 - 20_000_000) * CIT_RATE, 2);
  });

  it('honours a configurable flat rate over the CIT default', () => {
    const e = estimateAdditionalTax({ taxpayerType: 'INDIVIDUAL', declaredIncome: 0, observedIncome: 10_000_000, flatRate: 0.05 });
    expect(e.flatRate).toBeCloseTo(0.05, 5);
    expect(e.flatTax).toBeCloseTo(10_000_000 * 0.05, 2);
  });
});

describe('normalizeInflow', () => {
  it('no discount when outflow ratio is low', () => {
    const { observedIncome, passThroughDiscount } = normalizeInflow(1_000_000, 500_000);
    expect(passThroughDiscount).toBe(0);
    expect(observedIncome).toBe(1_000_000);
  });

  it('discounts up to 50% as the account looks like a conduit', () => {
    const heavy = normalizeInflow(1_000_000, 1_200_000); // ratio 1.2 → max discount
    expect(heavy.passThroughDiscount).toBeCloseTo(0.5, 2);
    expect(heavy.observedIncome).toBeCloseTo(500_000, 2);
  });

  it('is conservative — can only reduce observed income, never inflate it', () => {
    for (const outflow of [0, 500_000, 900_000, 1_000_000, 2_000_000]) {
      const { observedIncome } = normalizeInflow(1_000_000, outflow);
      expect(observedIncome).toBeLessThanOrEqual(1_000_000);
    }
  });

  it('handles zero inflow', () => {
    expect(normalizeInflow(0, 100).observedIncome).toBe(0);
  });
});

describe('scoreCase', () => {
  it('a large multi-provider gap with strong ID scores high', () => {
    const { confidence, reasons } = scoreCase({
      discrepancyPct: 2.5, providerCount: 3, avgMatchConfidence: 0.95, passThroughDiscount: 0, hasDeclaration: true,
    });
    expect(confidence).toBeGreaterThanOrEqual(0.7);
    expect(reasons.map((r) => r.code)).toEqual(expect.arrayContaining(['LARGE_GAP', 'MULTI_PROVIDER', 'STRONG_ID']));
  });

  it('weak identity and pass-through pull the score down', () => {
    const strong = scoreCase({ discrepancyPct: 1, providerCount: 1, avgMatchConfidence: 0.95, passThroughDiscount: 0, hasDeclaration: true });
    const weak = scoreCase({ discrepancyPct: 1, providerCount: 1, avgMatchConfidence: 0.4, passThroughDiscount: 0.4, hasDeclaration: true });
    expect(weak.confidence).toBeLessThan(strong.confidence);
    expect(weak.reasons.map((r) => r.code)).toEqual(expect.arrayContaining(['WEAK_ID', 'PASS_THROUGH']));
  });

  it('no declaration is itself a signal', () => {
    const { reasons } = scoreCase({ discrepancyPct: 1, providerCount: 1, avgMatchConfidence: 0.7, passThroughDiscount: 0, hasDeclaration: false });
    expect(reasons.map((r) => r.code)).toContain('NO_DECLARATION');
  });

  it('confidence is always clamped to 0..1', () => {
    const hi = scoreCase({ discrepancyPct: 5, providerCount: 5, avgMatchConfidence: 1, passThroughDiscount: 0, hasDeclaration: false });
    expect(hi.confidence).toBeLessThanOrEqual(1);
    expect(hi.confidence).toBeGreaterThanOrEqual(0);
  });
});

describe('confidenceToRisk', () => {
  it('bands confidence into risk levels', () => {
    expect(confidenceToRisk(0.9)).toBe('CRITICAL');
    expect(confidenceToRisk(0.7)).toBe('HIGH');
    expect(confidenceToRisk(0.5)).toBe('MEDIUM');
    expect(confidenceToRisk(0.2)).toBe('LOW');
  });
});

describe('agent fusion', () => {
  it('aggregateAgentScore lets the strongest signal dominate with a corroboration bonus', () => {
    expect(aggregateAgentScore([])).toBe(0);
    expect(aggregateAgentScore([{ score: 0.5 }])).toBeCloseTo(0.5, 5);
    // Two corroborating (≥0.4) → +0.08 over the top score.
    expect(aggregateAgentScore([{ score: 0.5 }, { score: 0.45 }])).toBeCloseTo(0.58, 5);
    // A weak second signal (<0.4) does not corroborate.
    expect(aggregateAgentScore([{ score: 0.5 }, { score: 0.2 }])).toBeCloseTo(0.5, 5);
  });

  it('compositeConfidence weights detection 0.6 / agents 0.4', () => {
    expect(compositeConfidence(1, 0)).toBeCloseTo(0.6, 5);
    expect(compositeConfidence(0, 1)).toBeCloseTo(0.4, 5);
    expect(compositeConfidence(0.5, 0.5)).toBeCloseTo(0.5, 5);
  });
});
