import {
  DEFAULT_SCHEMAS,
  applyPolicyNumberAlias,
  headersForColumnCheck,
  missingRequiredColumns,
  parseCsvText,
  validateRow,
} from './submission-parser';
import { ProviderPortalService } from '../provider-portal/provider-portal.service';

const insurer = 'INSURANCE';

describe('insurance: policyNumber is read as accountNumber', () => {
  it('lets an insurer file a header called policyNumber', () => {
    const headers = ['nin', 'policyNumber', 'accountName', 'bvn', 'customerType', 'totalInflow', 'totalOutflow'];
    expect(missingRequiredColumns(headers, DEFAULT_SCHEMAS.INSURANCE)).toContain('accountNumber'); // as is, it would be refused
    expect(missingRequiredColumns(headersForColumnCheck(insurer, headers), DEFAULT_SCHEMAS.INSURANCE)).toEqual([]);
  });

  it('still accepts the old accountNumber header from an insurer', () => {
    const headers = ['nin', 'accountNumber', 'accountName', 'bvn', 'customerType', 'totalInflow', 'totalOutflow'];
    expect(missingRequiredColumns(headersForColumnCheck(insurer, headers), DEFAULT_SCHEMAS.INSURANCE)).toEqual([]);
  });

  it('is case/spacing tolerant like the other headers', () => {
    expect(headersForColumnCheck(insurer, ['Policy Number'])).toEqual(['accountNumber']);
    expect(headersForColumnCheck(insurer, ['POLICY_NUMBER'])).toEqual(['accountNumber']);
  });

  it('changes nothing for any other provider type', () => {
    const headers = ['nin', 'policyNumber'];
    expect(headersForColumnCheck('BANK', headers)).toEqual(headers);
    const rows: Record<string, string>[] = [{ policyNumber: 'P1' }];
    applyPolicyNumberAlias('BANK', rows);
    expect(rows[0].accountNumber).toBeUndefined();
  });

  it('copies the policy number into accountNumber on every row, so the same validation and matching apply', () => {
    const csv = [
      'nin,policyNumber,accountName,bvn,customerType,totalInflow,totalOutflow',
      '12345678901,POL/2026/000123,ADA OBI,22212345678,INDIVIDUAL,100000,50000',
    ].join('\n');
    const { rows } = parseCsvText(csv);
    applyPolicyNumberAlias(insurer, rows);
    expect(rows[0].accountNumber).toBe('POL/2026/000123');
    expect(validateRow(rows[0], DEFAULT_SCHEMAS.INSURANCE).errors).toEqual([]);
  });

  it('a blank policy number is still refused (it is the same compulsory field)', () => {
    const rows: Record<string, string>[] = [{ nin: '12345678901', policyNumber: '', accountName: 'A', bvn: '22212345678', customerType: 'INDIVIDUAL', totalInflow: '1', totalOutflow: '1' }];
    applyPolicyNumberAlias(insurer, rows);
    expect(validateRow(rows[0], DEFAULT_SCHEMAS.INSURANCE).ok).toBe(false);
  });

  it('never overwrites an accountNumber the file already gave', () => {
    const rows: Record<string, string>[] = [{ accountNumber: 'ACC1', policyNumber: 'POL1' }];
    applyPolicyNumberAlias(insurer, rows);
    expect(rows[0].accountNumber).toBe('ACC1');
  });

  it('works on JSON records too (policyNumber key)', () => {
    const records: Record<string, any>[] = [{ policyNumber: 'POL9' }];
    applyPolicyNumberAlias(insurer, records);
    expect(records[0].accountNumber).toBe('POL9');
  });
});

describe('insurance: row errors say Policy number', () => {
  const blank = { nin: '12345678901', accountNumber: '', accountName: 'A', bvn: '22212345678', customerType: 'INDIVIDUAL', totalInflow: '1', totalOutflow: '1' };

  it('an insurer with no policy number is told so in policy words', () => {
    const r = validateRow({ ...blank }, DEFAULT_SCHEMAS.INSURANCE);
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toContain('Policy number is empty — enter the insurance policy number');
    expect(r.errors.join(' ')).not.toContain('Account number');
  });

  it('a bank still hears Account number', () => {
    const r = validateRow({ ...blank }, DEFAULT_SCHEMAS.BANK);
    expect(r.errors.join(' ')).toContain('Account number is empty');
  });

  it('a damaged (scientific-notation) policy number is also named as a policy number', () => {
    const r = validateRow({ ...blank, accountNumber: '1.23457E+09' }, DEFAULT_SCHEMAS.INSURANCE);
    expect(r.errors.join(' ')).toContain('Policy number "1.23457E+09"');
  });
});

describe('insurance template says Policy number', () => {
  const make = (providerType: string) => {
    const prisma: any = {
      dataProvider: { findUnique: jest.fn(async () => ({ providerType, name: 'Example Assurance Plc', reportingFrequency: 'QUARTERLY' })) },
      providerSchema: { findUnique: jest.fn(async () => null) },
      statutoryConfig: { findFirst: jest.fn(async () => null) },
      systemConfig: { findFirst: jest.fn(async () => null), findUnique: jest.fn(async () => null) },
    };
    return new ProviderPortalService(prisma, {} as any, {} as any, {} as any);
  };

  it('an insurer’s header row, example and column notes use policyNumber, not accountNumber', async () => {
    const t = await make('INSURANCE').uploadTemplate('p1');
    expect(t.fileName).toBe('bizdata-insurance-template.csv');
    const lines = t.csv.split('\n').filter((l) => !l.startsWith('#') && l.trim());
    expect(lines[0].split(',')).toContain('policyNumber');
    expect(lines[0].split(',')).not.toContain('accountNumber');
    expect(t.csv).toContain('POL/2026/000123');
    expect(t.csv).toMatch(/#\s+policyNumber — REQUIRED/);
    expect(t.csv).not.toMatch(/#\s+accountNumber/);
  });

  it('a bank’s template is unchanged', async () => {
    const t = await make('BANK').uploadTemplate('p1');
    const header = t.csv.split('\n').filter((l) => !l.startsWith('#') && l.trim())[0].split(',');
    expect(header).toContain('accountNumber');
    expect(header).not.toContain('policyNumber');
  });
});
