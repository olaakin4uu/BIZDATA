import { ToolRegistry } from './tool-registry';
import { AgentTool } from './tool.types';

function fake(name: string, roles: string[]): AgentTool {
  return {
    name,
    description: name,
    inputSchema: { type: 'object', properties: {} },
    sensitivity: 'READ',
    requiredRoles: roles,
    execute: async () => ({}),
  };
}

describe('ToolRegistry.catalogFor', () => {
  // The constructor takes the 7 real tools; we pass typed fakes.
  const reg = new ToolRegistry(
    fake('list_cases', ['READONLY', 'ANALYST', 'ADMIN']) as never,
    fake('explain_case', ['ANALYST', 'ADMIN']) as never,
    fake('taxpayer_summary', ['ANALYST', 'ADMIN']) as never,
    fake('scan_results', ['ANALYST', 'ADMIN']) as never,
    fake('run_scan', ['ANALYST', 'ADMIN']) as never,
    fake('generate_report', ['ANALYST', 'ADMIN']) as never,
    fake('draft_notice', ['ADMIN']) as never,
  );

  it('a READONLY user only sees the read tool they are permitted', () => {
    expect(reg.catalogFor('READONLY').map((t) => t.name)).toEqual(['list_cases']);
  });

  it('an ADMIN sees every tool', () => {
    expect(reg.catalogFor('ADMIN').map((t) => t.name).sort()).toEqual(
      ['draft_notice', 'explain_case', 'generate_report', 'list_cases', 'run_scan', 'scan_results', 'taxpayer_summary'],
    );
  });

  it('draft_notice is hidden from an ANALYST (cannot be invoked)', () => {
    expect(reg.catalogFor('ANALYST').map((t) => t.name)).not.toContain('draft_notice');
  });
});
