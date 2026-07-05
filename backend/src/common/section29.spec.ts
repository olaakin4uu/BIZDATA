import { BadRequestException } from '@nestjs/common';
import {
  SECTION_29_PROVIDER_TYPES,
  isSection29ProviderType,
  assertSection29ProviderType,
} from './section29';

describe('NTAA §29 provider scope', () => {
  const IN_SCOPE = ['BANK', 'FINTECH', 'PAYMENT_PROCESSOR', 'FX_BUREAU', 'POS_AGGREGATOR', 'INSURANCE'];
  const OUT_OF_SCOPE = ['TELCO', 'ECOMMERCE', 'OTHER'];

  it('allow-list is exactly the six financial-institution types', () => {
    expect([...SECTION_29_PROVIDER_TYPES].sort()).toEqual([...IN_SCOPE].sort());
  });

  it.each(IN_SCOPE)('accepts in-scope type %s', (t) => {
    expect(isSection29ProviderType(t)).toBe(true);
    expect(() => assertSection29ProviderType(t)).not.toThrow();
  });

  it.each(OUT_OF_SCOPE)('rejects out-of-scope type %s', (t) => {
    expect(isSection29ProviderType(t)).toBe(false);
    expect(() => assertSection29ProviderType(t)).toThrow(BadRequestException);
  });

  it('rejects null/undefined/unknown types', () => {
    expect(isSection29ProviderType(null)).toBe(false);
    expect(isSection29ProviderType(undefined)).toBe(false);
    expect(isSection29ProviderType('NOT_A_TYPE')).toBe(false);
    expect(() => assertSection29ProviderType(null)).toThrow(BadRequestException);
  });

  it('rejection message names §29 and the allowed types', () => {
    try {
      assertSection29ProviderType('TELCO');
      fail('should have thrown');
    } catch (e: any) {
      expect(e.message).toContain('§29');
      expect(e.message).toContain('BANK');
    }
  });
});
