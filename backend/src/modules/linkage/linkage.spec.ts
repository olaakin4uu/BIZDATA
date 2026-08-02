import { classifyIdAgreement } from './linkage.service';

/**
 * The name report's verdict on how much a name cluster can be trusted. Names are
 * a weak key — these rules are what stops a namesake coincidence being read as
 * one person operating several accounts.
 */
describe('classifyIdAgreement', () => {
  it('one identifier on every record is the same person', () => {
    expect(classifyIdAgreement(1, 0)).toBe('SAME_ID');
  });

  it('more than one identifier under one name needs a human', () => {
    expect(classifyIdAgreement(2, 0)).toBe('CONFLICTING');
    expect(classifyIdAgreement(9, 0)).toBe('CONFLICTING');
  });

  it('conflicting wins even when some records carry no identifier at all', () => {
    expect(classifyIdAgreement(3, 12)).toBe('CONFLICTING');
  });

  it('no identifier anywhere is the weakest lead, not a match', () => {
    expect(classifyIdAgreement(0, 5)).toBe('NO_ID');
    expect(classifyIdAgreement(0, 0)).toBe('NO_ID');
  });

  it('a partially-identified cluster is NOT treated as the same person', () => {
    // One id, but some rows carry none — those rows are exactly the ones that
    // could belong to someone else, so the cluster must not read as confirmed.
    expect(classifyIdAgreement(1, 1)).toBe('NO_ID');
    expect(classifyIdAgreement(1, 40)).toBe('NO_ID');
  });
});
