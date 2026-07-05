import { createHash } from 'crypto';
import { IdentityProvider, IdentityMatch } from '../identity-provider.interface';

/**
 * Deterministic mock of the NIBSS BVN→NIN bridge for development and demos.
 *
 * A given BVN always resolves to the same NIN (derived by hashing the BVN), so
 * the flow behaves like the real thing — repeatable, no external calls. A small
 * fraction of BVNs deterministically return "not found" to exercise that path.
 *
 * IMPORTANT: mock NINs are synthetic. Never treat them as authoritative — they
 * exist only so the enrichment/registration workflow can be built and tested
 * before the real NIBSS integration is wired in.
 */
export class MockIdentityProvider implements IdentityProvider {
  readonly name = 'MOCK';

  private deterministic(bvn: string): number {
    const h = createHash('sha256').update(bvn).digest();
    return h.readUInt32BE(0);
  }

  async resolveByBvn(bvn: string): Promise<IdentityMatch> {
    const seed = this.deterministic(bvn);

    // ~8% of lookups return no record, to exercise the not-found path.
    if (seed % 100 < 8) {
      return { nin: null, confidence: 0, source: 'MOCK', notFound: true };
    }

    // Derive a stable 11-digit NIN from the BVN hash.
    const nin = String(10000000000 + (seed % 89999999999)).slice(0, 11);
    return {
      nin,
      confidence: 0.99, // NIBSS BVN→NIN is authoritative when a record exists
      source: 'MOCK',
      dateOfBirth: null,
      stateOfOrigin: null,
    };
  }
}
