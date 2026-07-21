import { stableStringify, auditPayload, auditHash } from './audit.service';

/**
 * Regression guard for the §139 tamper-evidence chain.
 *
 * The audit hash is computed at WRITE time from the in-memory before/afterJson
 * and re-computed at VERIFY time from the jsonb round-trip. Any value whose
 * in-memory serialization differs from its jsonb-stored form breaks the chain
 * and falsely reports "tampered". A live `Date` in before/afterJson was the
 * real-world trigger (ELEVATION_APPROVE.afterJson.expiresAt): a Date has no
 * enumerable own keys, so the old serializer hashed it as `{}`, while Postgres
 * stored — and verification read back — its ISO string.
 */
describe('audit stableStringify — jsonb round-trip stability', () => {
  it('serializes a Date to its ISO string (the stored jsonb form)', () => {
    const d = new Date('2026-07-19T09:09:52.763Z');
    expect(stableStringify(d)).toBe(JSON.stringify(d.toISOString()));
  });

  it('hashes a Date value identically to its ISO-string form', () => {
    const iso = '2026-07-19T09:09:52.763Z';
    const withDate = auditPayload({
      actorType: 'STAFF', action: 'ELEVATION_APPROVE', entity: 'AccessElevation',
      entityId: 'e1', afterJson: { expiresAt: new Date(iso) }, ts: iso,
    });
    const withString = auditPayload({
      actorType: 'STAFF', action: 'ELEVATION_APPROVE', entity: 'AccessElevation',
      entityId: 'e1', afterJson: { expiresAt: iso }, ts: iso,
    });
    expect(withDate).toBe(withString);
    expect(auditHash('prev', withDate)).toBe(auditHash('prev', withString));
  });

  it('is order-independent for object keys (jsonb reorders keys)', () => {
    expect(stableStringify({ b: 1, a: 2 })).toBe(stableStringify({ a: 2, b: 1 }));
  });

  it('preserves the empty-object case (no false collision with Date)', () => {
    // A real empty object must NOT hash the same as a Date, or a Date could be
    // forged as {} and vice-versa.
    expect(stableStringify({})).toBe('{}');
    expect(stableStringify(new Date('2026-01-01T00:00:00.000Z'))).not.toBe('{}');
  });
});
