import {
  isValidBvnFormat,
  bvnModulo11CheckDigit,
  isValidBvnModulo11,
  nubanCheckDigit,
  isValidNuban,
  isArithmeticallyConsistent,
  validateIngestionRow,
} from './ingestion-validators';

// Build identifiers that satisfy the algorithms under test, so the suite is
// self-consistent rather than hard-coding magic numbers.
function validBvn(first10 = '2200000000'): string {
  const check = bvnModulo11CheckDigit(first10);
  return first10 + String(check);
}
function validNuban(bankCode: string, serial9: string): string {
  return serial9 + String(nubanCheckDigit(bankCode, serial9));
}

describe('BVN validation', () => {
  it('format requires 11 digits', () => {
    expect(isValidBvnFormat('22000000001')).toBe(true);
    expect(isValidBvnFormat('123')).toBe(false);
    expect(isValidBvnFormat(null)).toBe(false);
  });

  it('modulo-11 check digit accepts a self-consistent BVN and rejects a tampered one', () => {
    const good = validBvn('2212345678');
    expect(isValidBvnModulo11(good)).toBe(true);
    // Flip the last (check) digit → should fail.
    const bad = good.slice(0, 10) + String((Number(good[10]) + 1) % 10);
    expect(isValidBvnModulo11(bad)).toBe(false);
  });

  it('rejects wrong-length BVNs for the mod-11 check', () => {
    expect(isValidBvnModulo11('123')).toBe(false);
    expect(bvnModulo11CheckDigit('123')).toBeNull();
  });
});

describe('NUBAN check digit', () => {
  it('validates a self-consistent account number for a known bank code', () => {
    const acct = validNuban('057', '123456789');
    expect(isValidNuban(acct, '057')).toBe(true);
    // Tamper the check digit.
    const bad = acct.slice(0, 9) + String((Number(acct[9]) + 1) % 10);
    expect(isValidNuban(bad, '057')).toBe(false);
  });

  it('rejects non-10-digit account numbers', () => {
    expect(isValidNuban('12345', '057')).toBe(false);
  });

  it('skips validation when the bank code is unknown (returns true)', () => {
    expect(isValidNuban('1234567890', null)).toBe(true);
    expect(isValidNuban('1234567890', 'xx')).toBe(true);
  });

  it('nubanCheckDigit returns null for malformed inputs', () => {
    expect(nubanCheckDigit('05', '123456789')).toBeNull();
    expect(nubanCheckDigit('057', '123')).toBeNull();
  });
});

describe('arithmetic consistency', () => {
  it('accepts opening + inflow − outflow = closing', () => {
    expect(isArithmeticallyConsistent({
      openingBalance: '10000', totalInflow: '100000', totalOutflow: '50000', closingBalance: '60000',
    })).toBe(true);
  });

  it('rejects an inconsistent set beyond tolerance', () => {
    expect(isArithmeticallyConsistent({
      openingBalance: '10000', totalInflow: '100000', totalOutflow: '50000', closingBalance: '99999',
    })).toBe(false);
  });

  it('skips the check when any component is missing', () => {
    expect(isArithmeticallyConsistent({ openingBalance: '10000', totalInflow: '100000' })).toBe(true);
  });
});

describe('validateIngestionRow', () => {
  const goodBankRow = {
    bvn: validBvn('2212345678'),
    accountName: 'ACME LTD',
    accountNumber: validNuban('057', '123456789'),
    periodLabel: '2026-Q1',
    openingBalance: '10000', totalInflow: '100000', totalOutflow: '50000', closingBalance: '60000',
  };

  it('passes a well-formed bank row', () => {
    expect(validateIngestionRow(goodBankRow, 'BANK', '057')).toEqual([]);
  });

  it('flags a row with no identifier and no period', () => {
    const errs = validateIngestionRow({}, 'BANK', '057');
    expect(errs.join(' ')).toMatch(/no taxpayer identifier/i);
    expect(errs.join(' ')).toMatch(/missing period/i);
  });

  it('flags a bad NUBAN for a bank', () => {
    const bad = { ...goodBankRow, accountNumber: '1234567890' };
    expect(validateIngestionRow(bad, 'BANK', '057').join(' ')).toMatch(/NUBAN/);
  });

  it('does not apply NUBAN check to non-bank/fintech providers', () => {
    const row = { ...goodBankRow, accountNumber: '1234567890' };
    expect(validateIngestionRow(row, 'INSURANCE', '057').join(' ')).not.toMatch(/NUBAN/);
  });
});
