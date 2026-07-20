import { ToolExecutor } from './tool-executor';
import { AgentTool, ToolContext } from './tool.types';

const audit = { log: jest.fn().mockResolvedValue(undefined) };
const ctx = { staff: { id: 'u1' }, role: 'ADMIN' } as unknown as ToolContext;

function tool(overrides: Partial<AgentTool>): AgentTool {
  return {
    name: 't',
    description: 't',
    inputSchema: { type: 'object', properties: {} },
    sensitivity: 'READ',
    requiredRoles: ['ADMIN'],
    execute: async () => ({ ok: true }),
    ...overrides,
  };
}

function exec(t: AgentTool): ToolExecutor {
  const registry = { get: (n: string) => (n === t.name ? t : undefined) };
  return new ToolExecutor(registry as never, audit as never);
}

describe('ToolExecutor', () => {
  beforeEach(() => audit.log.mockClear());

  it('denies a role that is not permitted — as DATA, not an error', async () => {
    const r = await exec(tool({ requiredRoles: ['SUPER_ADMIN'] })).run('id', 't', {}, { ...ctx, role: 'ANALYST' });
    expect(r.isError).toBe(false);
    expect(JSON.parse(r.content).denied).toBe(true);
  });

  it('runs a permitted tool, returns its result, and audits', async () => {
    const r = await exec(tool({ execute: async () => ({ ok: true }) })).run('id', 't', {}, ctx);
    expect(JSON.parse(r.content)).toEqual({ ok: true });
    expect(audit.log).toHaveBeenCalledTimes(1);
  });

  it('turns a confirm sentinel into a card + neutral note (never claims it acted)', async () => {
    const card = { draftId: 'd1', kind: 'scan', title: 'Run scan', summary: 'y' };
    const r = await exec(tool({ execute: async () => ({ __confirmRequired: true, card }) })).run('id', 't', {}, ctx);
    expect(r.card).toEqual(card);
    expect(JSON.parse(r.content).status).toBe('awaiting_user_confirmation');
  });

  it('reports an unknown tool as an error', async () => {
    const r = await exec(tool({})).run('id', 'nope', {}, ctx);
    expect(r.isError).toBe(true);
  });
});
