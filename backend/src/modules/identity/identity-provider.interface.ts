/**
 * Identity-resolution provider abstraction.
 *
 * Two national sources bring an "invisible" individual into the tax net:
 *   - NIMC  — the National Identity Management Commission (owns the NIN).
 *   - NIBSS — the Nigeria Inter-Bank Settlement System (owns the BVN and can
 *             bridge a BVN to its linked NIN + verified demographics).
 *
 * The system only holds BVNs today, so the primary path is the NIBSS BVN→NIN
 * bridge. This interface is the single seam: today a deterministic mock backs
 * it; in production a NibssIdentityProvider calls the real API. Swapping is a
 * config change (IDENTITY_PROVIDER=nibss), not a code rewrite.
 */
export interface IdentityMatch {
  nin: string | null;
  firstName?: string | null;
  lastName?: string | null;
  middleName?: string | null;
  dateOfBirth?: string | null;   // ISO date
  phone?: string | null;
  stateOfOrigin?: string | null;
  /** 0..1 — confidence the source returns for this match. */
  confidence: number;
  /** Which source resolved it, for the audit trail. */
  source: 'NIBSS' | 'NIMC' | 'MOCK';
  /** True when the source found no record for the input. */
  notFound?: boolean;
}

export interface IdentityProvider {
  readonly name: string;
  /** Resolve a BVN to its linked NIN + verified demographics (NIBSS bridge). */
  resolveByBvn(bvn: string): Promise<IdentityMatch>;
  /** Verify/enrich directly from a NIN (NIMC lookup). Optional — not all providers offer it. */
  resolveByNin?(nin: string): Promise<IdentityMatch>;
}
