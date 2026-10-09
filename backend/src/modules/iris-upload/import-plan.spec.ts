import { applyMapping, validateCorrected, type ColumnMapping } from './import-plan';
import { DEFAULT_SCHEMAS } from '../submissions/submission-parser';

const schema = DEFAULT_SCHEMAS.BANK;

// A provider file with no period column. The return has none — the period is
// chosen on the form — yet every row used to be flagged "Missing period" and
// Approve stayed disabled.
const headers = ['NIN', 'ACCOUNTNAME', 'TOTALINFLOW'];
const mapping: ColumnMapping[] = [
  { source: 'NIN', target: 'nin', confidence: 1 },
  { source: 'ACCOUNTNAME', target: 'accountName', confidence: 1 },
  { source: 'TOTALINFLOW', target: 'totalInflow', confidence: 1 },
];
const rows = [
  { NIN: '68245543472', ACCOUNTNAME: 'A One', TOTALINFLOW: '26,095,541.60' },
  { NIN: '57415886004', ACCOUNTNAME: 'B Two', TOTALINFLOW: '24008756.88' },
];
const periodErrors = (v: ReturnType<typeof validateCorrected>) =>
  v.issues.flatMap((i) => i.errors).filter((e) => e === 'Missing period');

describe('IRIS upload — reporting period', () => {
  it('the return itself has no period column', () => {
    expect(schema.columns.some((c) => c.name === 'periodLabel')).toBe(false);
  });

  it('without the chosen period every row is flagged "Missing period"', () => {
    const out = applyMapping(headers, rows, mapping, schema);
    const v = validateCorrected(out.rows, schema, 'BANK');
    expect(periodErrors(v)).toEqual(['Missing period', 'Missing period']);
  });

  it('with the chosen period no row is flagged for it', () => {
    const out = applyMapping(headers, rows, mapping, schema);
    const v = validateCorrected(out.rows, schema, 'BANK', '2026-Q2');
    expect(periodErrors(v)).toEqual([]);
  });

  it('uses the period for the check only: the cleaned rows carry no period', () => {
    const out = applyMapping(headers, rows, mapping, schema);
    validateCorrected(out.rows, schema, 'BANK', '2026-Q2');
    expect(out.rows.every((r) => !('periodLabel' in r))).toBe(true);
  });

  it('other problems are still reported when the period is supplied', () => {
    const bad = [{ NIN: '68245543472', ACCOUNTNAME: 'A One', TOTALINFLOW: 'not a number' }];
    const out = applyMapping(headers, bad, mapping, schema);
    const v = validateCorrected(out.rows, schema, 'BANK', '2026-Q2');
    expect(v.reject).toBe(1);
    expect(periodErrors(v)).toEqual([]);
  });
});
