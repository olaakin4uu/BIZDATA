import {
  validateRow,
  missingRequiredColumns,
  parseFlexibleDate,
  parsePeriod,
  periodHasEnded,
  normalizePeriodLabel,
  DEFAULT_SCHEMAS,
  type SchemaTemplate,
} from './submission-parser';

describe('periodHasEnded — no future-period submissions', () => {
  const NOW = new Date('2026-07-19T00:00:00Z'); // mid-Q3 2026
  const ended = (label: string) => periodHasEnded(parsePeriod(label)!, NOW);

  it('allows periods that have fully ended', () => {
    expect(ended('2026-Q1')).toBe(true);  // ended 31 Mar
    expect(ended('2026-Q2')).toBe(true);  // ended 30 Jun
    expect(ended('2026-01')).toBe(true);  // month, ended
    expect(ended('2025')).toBe(true);     // prior year
  });

  it('blocks the current in-progress and future quarters', () => {
    expect(ended('2026-Q3')).toBe(false); // ends 30 Sep — not over
    expect(ended('2026-Q4')).toBe(false); // ends 31 Dec
    expect(ended('2026-07')).toBe(false); // current month
    expect(ended('2027')).toBe(false);    // future year
  });
});

describe('parsePeriod / normalizePeriodLabel', () => {
  it.each([
    ['2026-Q1', '2026-Q1'],
    ['2026Q1', '2026-Q1'],
    ['Q1 2026', '2026-Q1'],
    ['Q1-2026', '2026-Q1'],
    ['2026 Q1', '2026-Q1'],
    ['q3 2026', '2026-Q3'],
    ['2026-01', '2026-01'],
    ['2026-1', '2026-01'],
    ['Jan 2026', '2026-01'],
    ['March 2026', '2026-03'],
    ['2026', '2026'],
    ['2026-03-31', '2026-03'], // a full date → its month
    ['31/03/2026', '2026-03'],
  ])('normalises %s → %s', (input, expected) => {
    expect(normalizePeriodLabel(input)).toBe(expected);
  });

  it.each(['gibberish', '2026-13', 'Q5 2026', ''])('rejects %s', (input) => {
    expect(parsePeriod(input)).toBeNull();
    expect(normalizePeriodLabel(input)).toBeNull();
  });
});

describe('parseFlexibleDate', () => {
  it.each([
    ['2026-03-31', '2026-03-31'],
    ['31/03/2026', '2026-03-31'],
    ['31-03-2026', '2026-03-31'],
    ['31.03.2026', '2026-03-31'],
    ['2026/03/31', '2026-03-31'],
    ['03/28/2026', '2026-03-28'], // unambiguous month-first
    ['05/06/2026', '2026-06-05'], // ambiguous → day-first
    ['31/03/26', '2026-03-31'],   // 2-digit year
    ['1/2/2026', '2026-02-01'],
  ])('normalises %s → %s', (input, expected) => {
    expect(parseFlexibleDate(input)).toBe(expected);
  });

  it.each(['not a date', '32/01/2026', '31/13/2026', ''])('returns null for %s', (input) => {
    expect(parseFlexibleDate(input)).toBeNull();
  });
});

const BANK = DEFAULT_SCHEMAS.BANK;

// A row that satisfies every BANK required field with valid formats.
function validBankRow(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    bankCode: '057',
    bankName: 'Example Bank',
    accountNumber: '0123456788',
    bvn: '22212345678',
    nin: '12345678901',
    accountName: 'ADACHI VENTURES LTD',
    customerType: 'CORPORATE',
    sector: 'TRADING',
    businessType: 'Retail shop',
    transactionDate: '2026-01-15',
    periodLabel: '2026-Q1',
    totalInflow: '100000',
    openingBalance: '10000',
    closingBalance: '60000',
    ...overrides,
  };
}

describe('validateRow — required fields (compulsory columns)', () => {
  it('accepts a row with all required fields present and valid', () => {
    const { ok, errors } = validateRow(validBankRow(), BANK);
    expect(errors).toEqual([]);
    expect(ok).toBe(true);
  });

  // Hard-required fields (no grace period) reject immediately when blank.
  it.each(['nin', 'accountName', 'bvn', 'periodLabel', 'transactionDate'])(
    'rejects a row missing the hard-required field "%s"',
    (field) => {
      const { ok, errors } = validateRow(validBankRow({ [field]: '' }), BANK);
      expect(ok).toBe(false);
      expect(errors).toContain(`${field} is required`);
    },
  );

  it('treats whitespace-only as missing', () => {
    const { ok, errors } = validateRow(validBankRow({ nin: '   ' }), BANK);
    expect(ok).toBe(false);
    expect(errors).toContain('nin is required');
  });
});

describe('validateRow — grace period (soft-required fields)', () => {
  const BEFORE = { now: new Date('2026-08-01') }; // before 2027-01-01 enforce date
  const AFTER = { now: new Date('2027-06-01') };  // after it

  it.each(['sector', 'businessType', 'customerType'])(
    'warns (does NOT reject) when soft field "%s" is blank before the enforcement date',
    (field) => {
      const { ok, errors, warnings } = validateRow(validBankRow({ [field]: '' }), BANK, BEFORE);
      expect(ok).toBe(true); // accepted
      expect(errors).not.toContain(`${field} is required`);
      expect(warnings.some((w) => w.startsWith(`${field} is blank`))).toBe(true);
    },
  );

  it.each(['sector', 'businessType', 'customerType'])(
    'rejects soft field "%s" when blank on/after the enforcement date',
    (field) => {
      const { ok, errors } = validateRow(validBankRow({ [field]: '' }), BANK, AFTER);
      expect(ok).toBe(false);
      expect(errors).toContain(`${field} is required`);
    },
  );

  it('a config override date takes precedence over the schema default', () => {
    // Override to a past date → soft field is enforced now even though the
    // schema default (2027) has not arrived.
    const { ok } = validateRow(validBankRow({ sector: '' }), BANK, { now: new Date('2026-08-01'), enforceFrom: '2026-01-01' });
    expect(ok).toBe(false);
  });

  it('still accepts a fully-populated row before the date with no warnings', () => {
    const { ok, warnings } = validateRow(validBankRow(), BANK, BEFORE);
    expect(ok).toBe(true);
    expect(warnings).toEqual([]);
  });
});

describe('validateRow — format checks', () => {
  it('rejects a NIN that is not exactly 11 digits', () => {
    expect(validateRow(validBankRow({ nin: '123' }), BANK).errors).toContain('nin must be exactly 11 digits');
    expect(validateRow(validBankRow({ nin: 'abcdefghijk' }), BANK).errors).toContain('nin must be exactly 11 digits');
    expect(validateRow(validBankRow({ nin: '123456789012' }), BANK).errors).toContain('nin must be exactly 11 digits');
  });

  it('rejects an invalid customerType and accepts a valid one (case-insensitive)', () => {
    expect(validateRow(validBankRow({ customerType: 'ROBOT' }), BANK).errors)
      .toContain('customerType must be one of: INDIVIDUAL, CORPORATE');
    expect(validateRow(validBankRow({ customerType: 'individual' }), BANK).ok).toBe(true);
  });

  it('validates the optional email format only when present', () => {
    expect(validateRow(validBankRow({ customerEmail: 'not-an-email' }), BANK).errors)
      .toContain('customerEmail is not a valid email address');
    expect(validateRow(validBankRow({ customerEmail: 'a@b.co' }), BANK).ok).toBe(true);
    expect(validateRow(validBankRow({ customerEmail: '' }), BANK).ok).toBe(true); // optional & blank OK
  });

  it('validates currency as a 3-letter code', () => {
    expect(validateRow(validBankRow({ currency: 'Naira' }), BANK).errors)
      .toContain('currency must be a 3-letter currency code (e.g. NGN)');
    expect(validateRow(validBankRow({ currency: 'USD' }), BANK).ok).toBe(true);
  });

  it('accepts common date formats for transactionDate and normalises them in place', () => {
    for (const [input, iso] of [
      ['2026-03-31', '2026-03-31'],
      ['31/03/2026', '2026-03-31'],
      ['15-01-2026', '2026-01-15'],
      ['2026/02/28', '2026-02-28'],
    ] as const) {
      const row = validBankRow({ transactionDate: input });
      const { ok, errors } = validateRow(row, BANK);
      expect(errors).toEqual([]);
      expect(ok).toBe(true);
      expect(row.transactionDate).toBe(iso); // self-healed to ISO for storage
    }
  });

  it('rejects an unparseable transactionDate (now hard-required)', () => {
    const row = validBankRow({ transactionDate: 'sometime in March' });
    const { ok, errors } = validateRow(row, BANK);
    expect(ok).toBe(false); // required + unparseable → file-killer
    expect(errors.some((e) => e.includes('transactionDate') && e.includes('valid date'))).toBe(true);
  });

  it('rejects a blank transactionDate (now hard-required)', () => {
    const { ok, errors } = validateRow(validBankRow({ transactionDate: '' }), BANK);
    expect(ok).toBe(false);
    expect(errors).toContain('transactionDate is required');
  });

  it('rejects non-numeric amounts and enforces min', () => {
    expect(validateRow(validBankRow({ totalInflow: 'lots' }), BANK).errors).toContain('totalInflow must be a number');
    expect(validateRow(validBankRow({ totalInflow: '-5' }), BANK).errors).toContain('totalInflow must be at least 0');
  });
});

describe('missingRequiredColumns — file-level guard', () => {
  const header = BANK.columns.map((c) => c.name);

  it('returns [] when all required columns are present', () => {
    expect(missingRequiredColumns(header, BANK)).toEqual([]);
  });

  it('reports required columns absent from the header', () => {
    const withoutNin = header.filter((h) => h !== 'nin' && h !== 'sector');
    const missing = missingRequiredColumns(withoutNin, BANK);
    expect(missing).toContain('nin');
    expect(missing).toContain('sector');
  });

  it('ignores optional columns being absent', () => {
    const withoutOptional = header.filter((h) => h !== 'tin' && h !== 'customerEmail');
    expect(missingRequiredColumns(withoutOptional, BANK)).toEqual([]);
  });

  it('is case-insensitive on header names', () => {
    const upper = header.map((h) => h.toUpperCase());
    expect(missingRequiredColumns(upper, BANK)).toEqual([]);
  });
});
