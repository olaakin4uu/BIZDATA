import { Pseudonymizer } from './pseudonymizer';

describe('Pseudonymizer', () => {
  it('tokenises DB names from tool results and restores them in the reply', () => {
    const p = new Pseudonymizer();
    const toolResult = { taxpayer: 'Adebayo Okonkwo Enterprises', estimatedTax: 5_000_000 };
    p.scanValue(toolResult);

    const sent = p.applyValue(toolResult) as { taxpayer: string };
    expect(sent.taxpayer).toMatch(/^\[\[NAME_\d+\]\]$/);
    expect(sent.taxpayer).not.toContain('Adebayo');

    const modelReply = `${sent.taxpayer} should be reviewed for underdeclaration.`;
    expect(p.restore(modelReply)).toBe('Adebayo Okonkwo Enterprises should be reviewed for underdeclaration.');
  });

  it('gives the same token to the same name (stable within a turn)', () => {
    const p = new Pseudonymizer();
    p.scanValue({ taxpayer: 'Zenith Ltd' });
    const a = p.applyText('Zenith Ltd');
    const b = p.applyText('zenith ltd');
    expect(a).toBe(b);
  });

  it('masks financial identifiers even without registration', () => {
    const p = new Pseudonymizer();
    expect(p.applyText('BVN 12345678901')).not.toContain('12345678901');
  });
});
