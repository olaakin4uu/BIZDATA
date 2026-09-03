import {
  validateRow,
  missingRequiredColumns,
  parseFlexibleDate,
  parsePeriod,
  periodHasEnded,
  dateInPeriod,
  normalizePeriodLabel,
  DEFAULT_SCHEMAS,
  PROVIDER_TYPES,
  CUSTOMER_TYPES,
  LIMITED_LIABILITY_CUSTOMER_TYPES,
} from './submission-parser';

describe('dateInPeriod — transaction date must match the reported period', () => {
  it('accepts dates inside the quarter being reported', () => {
    expect(dateInPeriod('2026-04-01', '2026-Q2')).toBe(true); // first day of Q2
    expect(dateInPeriod('2026-06-30', '2026-Q2')).toBe(true); // last day of Q2
    expect(dateInPeriod('15/05/2026', '2026-Q2')).toBe(true); // DD/MM/YYYY inside Q2
  });

  it('rejects dates from a different or future quarter', () => {
    expect(dateInPeriod('2026-03-31', '2026-Q2')).toBe(false); // Q1 date in a Q2 file
    expect(dateInPeriod('2026-07-01', '2026-Q2')).toBe(false); // Q3 (future) date in a Q2 file
    expect(dateInPeriod('2026-10-15', '2026-Q2')).toBe(false); // Q4 date in a Q2 file
    expect(dateInPeriod('2025-06-15', '2026-Q2')).toBe(false); // right quarter, wrong year
  });

  it('respects month and year periods', () => {
    expect(dateInPeriod('2026-01-15', '2026-01')).toBe(true);
    expect(dateInPeriod('2026-02-01', '2026-01')).toBe(false);
    expect(dateInPeriod('2026-11-11', '2026')).toBe(true); // annual bucket
  });

  it('returns null when the date or period is unparseable', () => {
    expect(dateInPeriod('not a date', '2026-Q2')).toBeNull();
    expect(dateInPeriod('2026-05-01', 'garbage')).toBeNull();
  });
});

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

describe('DEFAULT_SCHEMAS — one seven-column return for every provider type', () => {
  it('every provider type exposes exactly the seven columns, in order', () => {
    for (const type of PROVIDER_TYPES) {
      expect(DEFAULT_SCHEMAS[type].columns.map((c) => c.name)).toEqual([
        'nin', 'accountNumber', 'accountName', 'bvn', 'customerType', 'totalInflow', 'totalOutflow', 'tin',
      ]);
    }
  });

  it('makes every column compulsory except tin, with no phase-in', () => {
    for (const type of PROVIDER_TYPES) {
      for (const col of DEFAULT_SCHEMAS[type].columns) {
        // tin is deliberately optional: it is the strongest match key and worth
        // collecting, but a provider that holds none must not have its whole
        // file rejected by the all-or-nothing row validation.
        expect(col.required).toBe(col.name !== 'tin');
        expect(col.validation?.enforceFrom).toBeUndefined();
      }
    }
  });

  it('drops every column the redesign removed', () => {
    const names = new Set(BANK.columns.map((c) => c.name));
    for (const gone of [
      'bankCode', 'bankName', 'periodLabel', 'periodQuarter', 'transactionDate', 'openingBalance',
      'closingBalance', 'transactionCount', 'sector', 'businessType', 'rcNumber',
      'phoneNumber', 'customerEmail', 'customerAddress', 'currency', 'conversionRate',
      'walletId', 'merchantId', 'policyNumber',
    ]) {
      expect(names.has(gone)).toBe(false);
    }
  });

  it('customerType covers INDIVIDUAL plus the five CAC classes', () => {
    const col = BANK.columns.find((c) => c.name === 'customerType')!;
    expect(col.validation?.enum).toEqual([
      'INDIVIDUAL', 'BUSINESS_NAME', 'PRIVATE_LIMITED',
      'PUBLIC_LIMITED', 'LIMITED_BY_GUARANTEE', 'INCORPORATED_TRUSTEES',
    ]);
  });

  it('only the three limited forms are limited-liability (federal CIT, not state income tax)', () => {
    expect([...LIMITED_LIABILITY_CUSTOMER_TYPES]).toEqual([
      'PRIVATE_LIMITED', 'PUBLIC_LIMITED', 'LIMITED_BY_GUARANTEE',
    ]);
    for (const stateAssessable of ['INDIVIDUAL', 'BUSINESS_NAME', 'INCORPORATED_TRUSTEES'] as const) {
      expect(LIMITED_LIABILITY_CUSTOMER_TYPES).not.toContain(stateAssessable);
    }
  });
});

// A row that satisfies every required field with valid formats.
function validRow(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    nin: '12345678901',
    accountNumber: '0123456788',
    accountName: 'ADACHI VENTURES LTD',
    bvn: '22212345678',
    customerType: 'PRIVATE_LIMITED',
    totalInflow: '100000',
    totalOutflow: '50000',
    ...overrides,
  };
}

describe('validateRow — required fields (compulsory columns)', () => {
  it('accepts a row with all required fields present and valid', () => {
    const { ok, errors } = validateRow(validRow(), BANK);
    expect(errors).toEqual([]);
    expect(ok).toBe(true);
  });

  // Every column is compulsory with no grace period — blank rejects immediately.
  it.each(['nin', 'accountNumber', 'accountName', 'bvn', 'customerType', 'totalInflow', 'totalOutflow'])(
    'rejects a row missing the required field "%s"',
    (field) => {
      const { ok, errors } = validateRow(validRow({ [field]: '' }), BANK);
      expect(ok).toBe(false);
      expect(errors).toContain(`${field} is required`);
    },
  );

  it('accepts a blank tin — the one optional column', () => {
    expect(validateRow(validRow({ tin: '' }), BANK).ok).toBe(true);
  });

  it('accepts a tin when supplied', () => {
    expect(validateRow(validRow({ tin: '12345678-0001' }), BANK).ok).toBe(true);
  });

  it('treats whitespace-only as missing', () => {
    const { ok, errors } = validateRow(validRow({ nin: '   ' }), BANK);
    expect(ok).toBe(false);
    expect(errors).toContain('nin is required');
  });

  it('ignores extra columns a provider still sends from an older, wider export', () => {
    const wide = validRow({ bankCode: '057', periodLabel: '2026-Q1', sector: 'TRADING' });
    expect(validateRow(wide, BANK).ok).toBe(true);
  });
});

describe('validateRow — no grace period on any column', () => {
  it('no column carries an enforceFrom, so nothing is phased in', () => {
    expect(BANK.columns.filter((c) => c.validation?.enforceFrom)).toEqual([]);
  });

  it('rejects a blank customerType today, not from some future date', () => {
    for (const ctx of [{ now: new Date('2026-08-01') }, { now: new Date('2027-06-01') }]) {
      const { ok, errors, warnings } = validateRow(validRow({ customerType: '' }), BANK, ctx);
      expect(ok).toBe(false);
      expect(errors).toContain('customerType is required');
      expect(warnings).toEqual([]); // never a soft warning
    }
  });

  it('a config enforcement-date override cannot soften a blank column', () => {
    // Even with a far-future override, a column with no enforceFrom is enforced now.
    const { ok } = validateRow(validRow({ customerType: '' }), BANK, { now: new Date('2026-08-01'), enforceFrom: '2099-01-01' });
    expect(ok).toBe(false);
  });

  it('accepts a fully-populated row with no warnings', () => {
    const { ok, warnings } = validateRow(validRow(), BANK, { now: new Date('2026-08-01') });
    expect(ok).toBe(true);
    expect(warnings).toEqual([]);
  });
});

describe('validateRow — format checks', () => {
  it('rejects a NIN that is not exactly 11 digits', () => {
    expect(validateRow(validRow({ nin: '123' }), BANK).errors).toContain('nin must be exactly 11 digits');
    expect(validateRow(validRow({ nin: 'abcdefghijk' }), BANK).errors).toContain('nin must be exactly 11 digits');
    expect(validateRow(validRow({ nin: '123456789012' }), BANK).errors).toContain('nin must be exactly 11 digits');
  });

  it('rejects a BVN that is not exactly 11 digits', () => {
    expect(validateRow(validRow({ bvn: '2221234567' }), BANK).errors).toContain('bvn must be exactly 11 digits');
  });

  it('accepts every CAC class, case-insensitively', () => {
    for (const t of CUSTOMER_TYPES) {
      expect(validateRow(validRow({ customerType: t }), BANK).ok).toBe(true);
      expect(validateRow(validRow({ customerType: t.toLowerCase() }), BANK).ok).toBe(true);
    }
  });

  it('rejects a customerType outside the CAC classes', () => {
    const { ok, errors } = validateRow(validRow({ customerType: 'CORPORATE' }), BANK);
    expect(ok).toBe(false); // the old catch-all value is no longer a valid class
    expect(errors).toContain(
      'customerType must be one of: INDIVIDUAL, BUSINESS_NAME, PRIVATE_LIMITED, PUBLIC_LIMITED, LIMITED_BY_GUARANTEE, INCORPORATED_TRUSTEES',
    );
  });

  it('rejects non-numeric amounts and enforces min', () => {
    expect(validateRow(validRow({ totalInflow: 'lots' }), BANK).errors).toContain('totalInflow "lots" must be a number');
    expect(validateRow(validRow({ totalInflow: '-5' }), BANK).errors).toContain('totalInflow must be at least 0');
    expect(validateRow(validRow({ totalOutflow: '-5' }), BANK).errors).toContain('totalOutflow must be at least 0');
  });

  it('names the exact fault on formatted amounts, echoing the value (no silent coercion)', () => {
    const comma = validateRow(validRow({ totalInflow: '2,500,000.00' }), BANK);
    expect(comma.ok).toBe(false);
    expect(comma.errors.join(' ')).toContain('"2,500,000.00" must be a plain number');
    expect(comma.errors.join(' ')).toContain('thousands separators');

    const naira = validateRow(validRow({ totalInflow: 'N250000' }), BANK);
    expect(naira.ok).toBe(false);
    expect(naira.errors.join(' ')).toContain('remove the currency sign');

    const parens = validateRow(validRow({ totalOutflow: '(5000)' }), BANK);
    expect(parens.ok).toBe(false);
    expect(parens.errors.join(' ')).toContain('minus sign for negatives');

    // A long garbage value is truncated in the echo, never dumped whole.
    const long = validateRow(validRow({ totalInflow: 'x'.repeat(80) }), BANK);
    expect(long.errors.some((e) => e.length < 120 && e.includes('must be a number'))).toBe(true);
  });
});

describe('missingRequiredColumns — file-level guard', () => {
  const header = BANK.columns.map((c) => c.name);

  it('returns [] when all required columns are present', () => {
    expect(missingRequiredColumns(header, BANK)).toEqual([]);
  });

  it('reports required columns absent from the header', () => {
    const missing = missingRequiredColumns(header.filter((h) => h !== 'nin' && h !== 'bvn'), BANK);
    expect(missing).toContain('nin');
    expect(missing).toContain('bvn');
  });

  it('reports every REQUIRED column when the header is empty — tin excepted', () => {
    expect(missingRequiredColumns([], BANK)).toEqual(header.filter((h) => h !== 'tin'));
  });

  it('is case-insensitive on header names', () => {
    expect(missingRequiredColumns(header.map((h) => h.toUpperCase()), BANK)).toEqual([]);
  });
});

/**
 * accountNumber is the only identifier column that cannot carry a length rule —
 * a NUBAN, a wallet id and a policy number are legitimately different lengths.
 * That left it entirely unchecked, so a value Excel had damaged filed silently
 * and was stored wrong while the submission reported success.
 *
 * Two guards now, matched to whether the damage is recoverable:
 *   scientific notation  → ERROR   (digits destroyed, nothing can repair it)
 *   wrong NUBAN length   → WARNING (digits intact, provider can judge it)
 */
describe('validateRow — identifier damaged in export', () => {
  const FINTECH = DEFAULT_SCHEMAS.FINTECH;

  it.each(['1.23457E+09', '1.23457e+09', '1E+09', '1.23457E9', '9.87654E-05'])(
    'rejects an accountNumber a spreadsheet rewrote as %s',
    (mangled) => {
      const { ok, errors } = validateRow(validRow({ accountNumber: mangled }), BANK);
      expect(ok).toBe(false);
      expect(errors.join(' ')).toContain('scientific notation');
    },
  );

  it('rejects a tin in scientific notation too', () => {
    const { ok, errors } = validateRow(validRow({ tin: '1.23457E+09' }), BANK);
    expect(ok).toBe(false);
    expect(errors.join(' ')).toContain('scientific notation');
  });

  // The check must not fire on identifiers that merely contain an E. A bare
  // 12E34 is a plausible merchant or policy reference, not a mangled number.
  it.each(['12E34', '0123456788', 'DOM-00123', 'WALLET-9E', 'A1E5B'])(
    'leaves the legitimate identifier %s alone',
    (id) => {
      const { errors } = validateRow(validRow({ accountNumber: id }), BANK);
      expect(errors.join(' ')).not.toContain('scientific notation');
    },
  );

  it('warns — but does not reject — when a bank files a short NUBAN', () => {
    const { ok, errors, warnings } = validateRow(validRow({ accountNumber: '123456788' }), BANK);
    expect(ok).toBe(true); // the row still files
    expect(errors).toEqual([]);
    expect(warnings.join(' ')).toContain('9 digits');
    expect(warnings.join(' ')).toContain('leading zero');
  });

  it('stays quiet on a correct 10-digit NUBAN', () => {
    expect(validateRow(validRow({ accountNumber: '0123456788' }), BANK).warnings).toEqual([]);
  });

  // Only banks file NUBANs. A wallet id of another length is normal elsewhere.
  it('does not warn a non-bank provider about NUBAN length', () => {
    const { ok, warnings } = validateRow(validRow({ accountNumber: '123456788' }), FINTECH);
    expect(ok).toBe(true);
    expect(warnings).toEqual([]);
  });

  // A bank may legitimately report something that is not a NUBAN at all.
  it('does not warn a bank about a non-numeric account identifier', () => {
    expect(validateRow(validRow({ accountNumber: 'DOM-00123456' }), BANK).warnings).toEqual([]);
  });
});
