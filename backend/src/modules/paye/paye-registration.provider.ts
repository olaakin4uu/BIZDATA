/**
 * PAYE-registration provider abstraction.
 *
 * "Registering an employer for PAYE" is ultimately an action in the KIRS Tax
 * app, not in BIZDATA. But the Tax app does not yet expose a create-registration
 * endpoint, so this interface is the seam:
 *
 *   - MockPayeRegistrationProvider (default) — issues a PROVISIONAL PAYE number
 *     locally and marks the taxpayer registered in BIZDATA. Works today.
 *   - TaxAppPayeRegistrationProvider — POSTs a real registration to the Tax app
 *     and returns the official PAYE number. Activated by env
 *     (PAYE_REG_PROVIDER=taxapp + TAX_APP_BASE_URL + TAX_APP_API_KEY) once KIRS
 *     builds their endpoint. See docs/INTEGRATION-PAYE.md.
 *
 * Swapping is a config change, not a code rewrite (mirrors the identity provider).
 */

export interface PayeRegistrationInput {
  taxpayerId: string;
  businessName: string | null;
  rcNumber: string | null;
  tin: string | null;
}

export interface PayeRegistrationResult {
  payeRegNumber: string;
  /** true = a real registration created in the Tax app; false = provisional in BIZDATA only. */
  official: boolean;
  source: 'TAX_APP' | 'PROVISIONAL';
}

export interface PayeRegistrationProvider {
  readonly name: string;
  register(input: PayeRegistrationInput): Promise<PayeRegistrationResult>;
}

/**
 * Default provider — no external call. Issues a provisional PAYE number so the
 * employer is brought into BIZDATA's PAYE net immediately; flagged provisional
 * until a real registration is confirmed with the Tax app.
 */
export class MockPayeRegistrationProvider implements PayeRegistrationProvider {
  readonly name = 'PROVISIONAL';

  async register(input: PayeRegistrationInput): Promise<PayeRegistrationResult> {
    // Deterministic-looking provisional number: PAYE-<8 hex of the taxpayer id>.
    const suffix = input.taxpayerId.replace(/-/g, '').slice(0, 8).toUpperCase();
    return { payeRegNumber: `PAYE-PROV-${suffix}`, official: false, source: 'PROVISIONAL' };
  }
}

/**
 * Real provider — calls the KIRS Tax app to create a PAYE registration.
 * Inert until env is set; the outbound contract is documented in
 * docs/INTEGRATION-PAYE.md (§ "Outbound: create PAYE registration").
 */
export class TaxAppPayeRegistrationProvider implements PayeRegistrationProvider {
  readonly name = 'TAX_APP';
  constructor(private cfg: { baseUrl?: string; apiKey?: string }) {}

  async register(input: PayeRegistrationInput): Promise<PayeRegistrationResult> {
    if (!this.cfg.baseUrl || !this.cfg.apiKey) {
      throw new Error('Tax-app PAYE registration is not configured (TAX_APP_BASE_URL / TAX_APP_API_KEY).');
    }
    const res = await fetch(`${this.cfg.baseUrl.replace(/\/$/, '')}/paye/registrations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': this.cfg.apiKey },
      body: JSON.stringify({
        businessName: input.businessName,
        rcNumber: input.rcNumber,
        tin: input.tin,
        source: 'BIZDATA',
      }),
    });
    if (!res.ok) {
      throw new Error(`Tax app registration failed (HTTP ${res.status})`);
    }
    const data: any = await res.json().catch(() => ({}));
    const payeRegNumber = data?.payeRegNumber ?? data?.payeNumber;
    if (!payeRegNumber) throw new Error('Tax app did not return a payeRegNumber.');
    return { payeRegNumber: String(payeRegNumber), official: true, source: 'TAX_APP' };
  }
}
