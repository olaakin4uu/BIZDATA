import { redactPii } from './redaction';

describe('redactPii', () => {
  it('masks an 11-digit NIN/BVN but keeps a short suffix', () => {
    const out = redactPii('NIN 12345678901 on file');
    expect(out).not.toContain('12345678901');
    expect(out).toContain('901');
  });

  it('masks a 10-digit NUBAN account', () => {
    const out = redactPii('account 0123456789');
    expect(out).not.toContain('0123456789');
    expect(out.trimEnd().endsWith('789')).toBe(true);
  });

  it('masks a Nigerian phone number', () => {
    expect(redactPii('call 08031234567')).not.toContain('08031234567');
    expect(redactPii('call +2348031234567')).not.toContain('2348031234567');
  });

  it('leaves ordinary text (incl. a 4-digit year) untouched', () => {
    expect(redactPii('Zenith Bank case for 2025')).toBe('Zenith Bank case for 2025');
  });
});
