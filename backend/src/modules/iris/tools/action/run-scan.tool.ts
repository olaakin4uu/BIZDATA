import { Injectable } from '@nestjs/common';
import { ScanService } from '../../../scan/scan.service';
import { DraftProposer } from '../../approval/draft-proposer';
import { ActionTool, CommitResult } from '../../approval/action.types';
import { ToolContext } from '../tool.types';

/**
 * MUTATE: propose running an underdeclaration scan. execute() only prepares a
 * draft; commit() (after the officer confirms) calls ScanService.create.
 */
@Injectable()
export class RunScanTool implements ActionTool {
  readonly name = 'run_scan';
  readonly kind = 'scan';
  readonly sensitivity = 'MUTATE' as const;
  readonly requiredRoles = ['SUPER_ADMIN', 'ADMIN', 'SUPERVISOR', 'ANALYST'];
  readonly description =
    'Propose running an underdeclaration scan for a year at a discrepancy threshold. ' +
    'This PREPARES A DRAFT the officer must confirm — it does NOT run the scan itself. ' +
    'The scan re-evaluates all reportable taxpayers and updates their cases.';
  readonly inputSchema = {
    type: 'object',
    properties: {
      year: { type: 'integer', description: 'Assessment year, e.g. 2025.' },
      threshold: {
        type: 'number',
        description: 'Discrepancy threshold 0–1 (0.2 = flag when observed income exceeds declared by 20%). Omit for the statutory default.',
      },
    },
    required: ['year'],
  };

  constructor(
    private proposer: DraftProposer,
    private scan: ScanService,
  ) {}

  async execute(args: Record<string, unknown>, ctx: ToolContext): Promise<unknown> {
    const year = Number(args.year);
    if (!year) throw new Error('A year is required to run a scan.');
    const threshold = typeof args.threshold === 'number' ? args.threshold : undefined;
    return this.proposer.propose(ctx, {
      kind: this.kind,
      title: `Run ${year} underdeclaration scan`,
      summary:
        `Run the underdeclaration scan for ${year} ` +
        (threshold != null ? `at a ${Math.round(threshold * 100)}% discrepancy threshold` : 'at the statutory default threshold') +
        '. This re-scans all reportable taxpayers and updates their cases.',
      payload: { year, threshold: threshold ?? null },
      details: { year, threshold: threshold ?? 'statutory default' },
    });
  }

  async commit(payload: Record<string, unknown>, ctx: ToolContext): Promise<CommitResult> {
    const year = Number(payload.year);
    const threshold = typeof payload.threshold === 'number' ? payload.threshold : undefined;
    const scan = await this.scan.create({ year, threshold }, ctx.staff.id);
    return {
      message: `Scan started for ${year} (id ${scan.id}). It runs in the background; cases will update shortly.`,
      resultRef: scan.id,
    };
  }
}
