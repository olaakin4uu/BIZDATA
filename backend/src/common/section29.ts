import { BadRequestException } from '@nestjs/common';

/**
 * NTAA 2025 §29 scope — financial-institution data submission.
 *
 * §29 places the reporting obligation on FINANCIAL INSTITUTIONS: they must file
 * annual returns of any customer whose cumulative transactions IN A MONTH reach
 * the §29 thresholds (₦50m individual / ₦250m corporate — authoritative gazette
 * No. 117 of 26 Jun 2025). This platform therefore only accepts data from
 * provider types that ARE §29 financial institutions —
 * CBN-regulated deposit-takers / account holders / financial-transaction
 * processors, plus insurers.
 *
 * Out-of-scope provider types (TELCO, ECOMMERCE, OTHER) are NOT financial
 * institutions and their data is not a §29 return, so new onboarding and new
 * submissions from them are rejected. Any data already ingested under them is
 * left in place (non-destructive) but flagged as out-of-scope in the UI.
 */
export const SECTION_29_PROVIDER_TYPES = [
  'BANK',
  'FINTECH',
  'PAYMENT_PROCESSOR',
  'FX_BUREAU',
  'POS_AGGREGATOR',
  'INSURANCE',
] as const;

export type Section29ProviderType = (typeof SECTION_29_PROVIDER_TYPES)[number];

const SET = new Set<string>(SECTION_29_PROVIDER_TYPES);

/** True when a provider type is a §29 financial institution (in scope). */
export function isSection29ProviderType(type: string | null | undefined): boolean {
  return type != null && SET.has(type);
}

/**
 * Throw a 400 if a provider type is out of §29 scope. Use at every intake point
 * (provider onboarding, submission ingestion) so out-of-scope data can never
 * enter, while existing data is untouched.
 */
export function assertSection29ProviderType(type: string | null | undefined): void {
  if (!isSection29ProviderType(type)) {
    throw new BadRequestException(
      `Provider type "${type}" is outside NTAA §29 scope. This platform accepts data only from financial institutions (${SECTION_29_PROVIDER_TYPES.join(', ')}).`,
    );
  }
}
