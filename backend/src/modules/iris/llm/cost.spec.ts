import { costUsdMicros } from './cost';

describe('costUsdMicros', () => {
  it('prices Opus 4.8 at $5/$25 per 1M (micro-USD per token)', () => {
    expect(costUsdMicros('claude-opus-4-8', { inputTokens: 1000, outputTokens: 100 })).toBe(1000 * 5 + 100 * 25);
  });

  it('prices Haiku 4.5 at $1/$5', () => {
    expect(costUsdMicros('claude-haiku-4-5', { inputTokens: 2000, outputTokens: 500 })).toBe(2000 * 1 + 500 * 5);
  });

  it('falls back to Sonnet pricing for an unknown model', () => {
    expect(costUsdMicros('some-future-model', { inputTokens: 1000, outputTokens: 0 })).toBe(1000 * 3);
  });
});
