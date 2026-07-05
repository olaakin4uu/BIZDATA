import { IdentityProvider, IdentityMatch } from '../identity-provider.interface';

/**
 * Real NIBSS BVN→NIN bridge. Wired in when IDENTITY_PROVIDER=nibss and the
 * NIBSS credentials are present. Until then it throws a clear, actionable error
 * so the system never silently returns fake data in production.
 *
 * To activate:
 *   1. Obtain NIBSS API credentials (client id/secret + the mutual-TLS certs
 *      required for the BVN verification service).
 *   2. Set env: IDENTITY_PROVIDER=nibss, NIBSS_BASE_URL, NIBSS_CLIENT_ID,
 *      NIBSS_CLIENT_SECRET (and the TLS cert paths).
 *   3. Implement the two calls below against the NIBSS BVN verification API —
 *      the request/response mapping is the only code that changes; every caller
 *      already speaks IdentityMatch.
 */
export class NibssIdentityProvider implements IdentityProvider {
  readonly name = 'NIBSS';

  constructor(
    private readonly config: {
      baseUrl?: string;
      clientId?: string;
      clientSecret?: string;
    },
  ) {}

  private assertConfigured() {
    if (!this.config.baseUrl || !this.config.clientId || !this.config.clientSecret) {
      throw new Error(
        'NIBSS identity provider is selected but not configured. Set NIBSS_BASE_URL, ' +
        'NIBSS_CLIENT_ID and NIBSS_CLIENT_SECRET, or set IDENTITY_PROVIDER=mock for development.',
      );
    }
  }

  async resolveByBvn(_bvn: string): Promise<IdentityMatch> {
    this.assertConfigured();
    // TODO(nibss): call the BVN verification endpoint, map the response to
    // IdentityMatch { nin, firstName, lastName, dateOfBirth, phone, confidence,
    // source: 'NIBSS' }. Handle not-found → { nin: null, notFound: true }.
    throw new Error('NIBSS resolveByBvn not yet implemented — awaiting API integration.');
  }
}
