import { IdentityMatch, IdentityProvider } from '../identity-provider.interface';

/**
 * Default when IDENTITY_PROVIDER is unset or unrecognised. Previously this slot
 * silently fell back to MockIdentityProvider, which fabricates a deterministic
 * fake NIN from the BVN and returns it at confidence 0.99 — on a production box
 * with no real NIBSS credentials configured, that meant every resolution
 * silently "succeeded" with an invented identifier. This provider refuses
 * instead: a lookup should fail loudly, not succeed with fake data presented as
 * verified. IDENTITY_PROVIDER=mock remains available as an explicit opt-in for
 * local development/demos.
 */
export class FailClosedIdentityProvider implements IdentityProvider {
  readonly name = 'UNCONFIGURED';

  async resolveByBvn(): Promise<IdentityMatch> {
    throw new Error(
      'No identity provider is configured. Set IDENTITY_PROVIDER=nibss (with NIBSS_BASE_URL/' +
      'NIBSS_CLIENT_ID/NIBSS_CLIENT_SECRET) for real BVN→NIN resolution, or IDENTITY_PROVIDER=mock ' +
      'for local development only.',
    );
  }
}
