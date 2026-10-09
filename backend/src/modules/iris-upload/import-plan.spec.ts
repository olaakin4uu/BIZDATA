import { applyMapping, validateCorrected, type ColumnMapping } from './import-plan';
import { DEFAULT_SCHEMAS } from '../submissions/submission-parser';

const schema = DEFAULT_SCHEMAS.BANK;

// A provider file with no period column. The return has none — the provider
// picks the period on the form — so no row may be flagged for lacking one.
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
const allErrors = (v: ReturnType<typeof validateCorrected>) => v.issues.flatMap((i) => i.errors);

describe('IRIS upload — reporting period', () => {
  it('the return itself has no period column', () => {
    expect(schema.columns.some((c) => c.name === 'periodLabel')).toBe(false);
  });

  it('never flags a row for a missing period', () => {
    const out = applyMapping(headers, rows, mapping, schema);
    expect(allErrors(validateCorrected(out.rows, schema, 'BANK')).some((e) => /missing period/i.test(e))).toBe(false);
  });

  it('still reports the real problems in a row', () => {
    const out = applyMapping(headers, rows, mapping, schema);
    const v = validateCorrected(out.rows, schema, 'BANK');
    expect(v.reject).toBe(2);
    expect(allErrors(v).some((e) => /outflow/i.test(e))).toBe(true);
  });
});
