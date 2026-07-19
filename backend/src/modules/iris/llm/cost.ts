/**
 * COGS metering for IRIS (the margin/control layer). We record the raw Claude
 * cost per turn so you can bill the authority a fixed module fee and see your
 * true cost of goods. Prices are USD per 1,000,000 tokens — which conveniently
 * equals micro-USD PER TOKEN, so cost-in-micros = input*inPerM + output*outPerM
 * with no floating point.
 */
const PRICES: Record<string, { in: number; out: number }> = {
  'claude-opus-4-8': { in: 5, out: 25 },
  'claude-opus-4-7': { in: 5, out: 25 },
  'claude-sonnet-5': { in: 3, out: 15 },
  'claude-sonnet-4-6': { in: 3, out: 15 },
  'claude-haiku-4-5': { in: 1, out: 5 },
};

/** Cost of a turn in integer micro-USD. Falls back to Sonnet pricing for an
 *  unknown model id so we never under-record. */
export function costUsdMicros(
  model: string,
  usage: { inputTokens: number; outputTokens: number },
): number {
  const p = PRICES[model] ?? PRICES['claude-sonnet-5'];
  return Math.round(usage.inputTokens * p.in + usage.outputTokens * p.out);
}
