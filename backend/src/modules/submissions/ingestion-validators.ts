/**
 * Ingestion validation gate.
 *
 * Before a bank-report row is persisted it must pass integrity checks so that
 * downstream matching and Best-of-Judgement assessments rest on clean data:
 *   - completeness    — the row carries enough to match and assess
 *   - BVN format      — 11 numeric digits (see note below on check digits)
 *   - NUBAN check digit — the CBN-standard 10-digit account-number check digit
 *   - arithmetic      — opening + inflow − outflow ≈ closing (when balances given)
 *
 * These are pure functions so they can be unit-tested independently of the DB.
 */

export interface RowForValidation {
  bvn?: string | null;
  nin?: string | null;
  accountNumber?: string | null;
  accountName?: string | null;
  periodLabel?: string | null;
  totalInflow?: string | null;
  totalOutflow?: string | null;
  openingBalance?: string | null;
  closingBalance?: string | null;
}

const digitsOnly = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '');

/**
 * BVN is an 11-digit numeric identifier. The CBN does not publish a check-digit
 * algorithm for the BVN, so the strongest defensible check at ingest is strict
 * format validation (length + numeric). True validity is confirmed downstream by
 * the BVN→taxpayer match. (If the authority later shares an official BVN check
 * algorithm, add it here.)
 */
export function isValidBvnFormat(bvn: string | null | undefined): boolean {
  const d = digitsOnly(bvn);
  return d.length === 11;
}

/**
 * Modulo-11 check on the 11-digit BVN: weight the first 10 digits 2..11, sum,
 * take mod 11; the 11th digit is the check digit (a remainder of 10 maps to 0).
 *
 * NOTE: the CBN does not publish an official BVN check-digit algorithm, so this
 * is the §6.4-prescribed modulo-11 scheme and is OPT-IN (env BVN_CHECKDIGIT_ENFORCED).
 * Do not hard-enforce until the authority confirms the exact weighting, or valid
 * BVNs will be rejected. Format validation remains the default gate.
 */
export function bvnModulo11CheckDigit(first10: string): number | null {
  const d = digitsOnly(first10);
  if (d.length !== 10) return null;
  let sum = 0;
  for (let i = 0; i < 10; i++) sum += Number(d[i]) * (i + 2);
  const rem = sum % 11;
  return rem === 10 ? 0 : rem;
}

export function isValidBvnModulo11(bvn: string | null | undefined): boolean {
  const d = digitsOnly(bvn);
  if (d.length !== 11) return false;
  const expected = bvnModulo11CheckDigit(d.slice(0, 10));
  return expected != null && expected === Number(d[10]);
}

/**
 * Compute the CBN NUBAN check digit from a 3-digit bank code and 9-digit serial.
 * Algorithm (CBN NUBAN spec): concatenate bankCode(3) + serial(9) = 12 digits,
 * apply the weight pattern 3,7,3 repeated, sum products, then
 * checkDigit = 10 − (sum mod 10), and 10 maps to 0.
 */
export function nubanCheckDigit(bankCode: string, serial9: string): number | null {
  const bc = digitsOnly(bankCode);
  const sr = digitsOnly(serial9);
  if (bc.length !== 3 || sr.length !== 9) return null;
  const weights = [3, 7, 3, 3, 7, 3, 3, 7, 3, 3, 7, 3];
  const seed = bc + sr; // 12 digits
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(seed[i]) * weights[i];
  const mod = sum % 10;
  const check = 10 - mod;
  return check === 10 ? 0 : check;
}

/**
 * Validate a 10-digit NUBAN account number against its bank code.
 * Returns true if the embedded check digit is correct. When the bank code is
 * unknown we cannot validate, so we return true (skip) rather than reject.
 */
export function isValidNuban(accountNumber: string | null | undefined, bankCode: string | null | undefined): boolean {
  const acct = digitsOnly(accountNumber);
  const bc = digitsOnly(bankCode);
  if (acct.length !== 10) return false;          // NUBAN is exactly 10 digits
  if (bc.length !== 3) return true;              // unknown bank code → cannot check
  const expected = nubanCheckDigit(bc, acct.slice(0, 9));
  if (expected == null) return true;
  return expected === Number(acct[9]);
}

/**
 * Arithmetic consistency: opening + inflow − outflow should equal closing,
 * within a small tolerance, when all four are present. Returns true if
 * consistent OR if any component is missing (nothing to check).
 */
export function isArithmeticallyConsistent(row: RowForValidation, toleranceNaira = 1): boolean {
  const nums = [row.openingBalance, row.totalInflow, row.totalOutflow, row.closingBalance];
  if (nums.some((v) => v == null || v === '')) return true; // incomplete → skip
  const [open, inflow, outflow, close] = nums.map((v) => Number(v));
  if ([open, inflow, outflow, close].some((n) => Number.isNaN(n))) return true;
  return Math.abs(open + inflow - outflow - close) <= toleranceNaira;
}

/**
 * Run the full gate for a row of a given provider type. Returns the list of
 * failure messages (empty = passes). NUBAN/BVN checks only apply where those
 * identifiers are expected (banks / fintechs).
 */
export function validateIngestionRow(
  row: RowForValidation,
  providerType: string,
  bankCode?: string | null,
): string[] {
  const errors: string[] = [];

  // Completeness: must be matchable (an identifier or a name) and have a period.
  if (!row.bvn && !row.nin && !row.accountName) {
    errors.push('No taxpayer identifier (bvn / nin / accountName) — row cannot be matched');
  }
  if (!row.periodLabel) {
    errors.push('Missing period');
  }

  // BVN format (where provided)
  if (row.bvn && !isValidBvnFormat(row.bvn)) {
    errors.push('BVN must be 11 digits');
  }

  // NUBAN check digit for bank/fintech account numbers
  const expectsNuban = providerType === 'BANK' || providerType === 'FINTECH';
  if (expectsNuban && row.accountNumber && !isValidNuban(row.accountNumber, bankCode)) {
    errors.push('Account number fails NUBAN check-digit validation');
  }

  // Arithmetic consistency of balances
  if (!isArithmeticallyConsistent(row)) {
    errors.push('Balances inconsistent: opening + inflow − outflow ≠ closing');
  }

  return errors;
}
