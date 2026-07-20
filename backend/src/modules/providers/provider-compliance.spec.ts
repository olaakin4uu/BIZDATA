import { monthsInDefault, s101Penalty } from './provider-compliance.service';

describe('monthsInDefault', () => {
  const due = new Date('2025-04-15T00:00:00Z');

  it('is zero on or before the due date', () => {
    expect(monthsInDefault(due, new Date('2025-04-15T00:00:00Z'))).toBe(0);
    expect(monthsInDefault(due, new Date('2025-04-10T00:00:00Z'))).toBe(0);
  });

  it('is 1 for any default within the first month', () => {
    expect(monthsInDefault(due, new Date('2025-04-16T00:00:00Z'))).toBe(1); // 1 day late
    expect(monthsInDefault(due, new Date('2025-05-10T00:00:00Z'))).toBe(1); // ~25 days
  });

  it('rolls into subsequent whole months', () => {
    expect(monthsInDefault(due, new Date('2025-06-01T00:00:00Z'))).toBe(2); // ~47 days
    expect(monthsInDefault(due, new Date('2025-07-20T00:00:00Z'))).toBe(4); // ~96 days
  });
});

describe('s101Penalty (NTAA 2025 s.101)', () => {
  const FIRST = 100_000;
  const PER = 50_000;

  it('is zero when not in default', () => {
    expect(s101Penalty(0, FIRST, PER)).toBe(0);
  });

  it('charges only the first-month fine for a single month', () => {
    expect(s101Penalty(1, FIRST, PER)).toBe(100_000);
  });

  it('adds the per-month fine for each subsequent month', () => {
    expect(s101Penalty(2, FIRST, PER)).toBe(150_000); // 100k + 1×50k
    expect(s101Penalty(4, FIRST, PER)).toBe(250_000); // 100k + 3×50k
  });

  it('honours configurable amounts', () => {
    expect(s101Penalty(3, 200_000, 25_000)).toBe(250_000); // 200k + 2×25k
  });
});
