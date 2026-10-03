import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { AuditService } from '../services/audit.service';
import { CryptoService } from '../services/crypto.service';

/**
 * Staff reads that return individual-level personal data, keyed
 * `Controller.handler`. Each successful call writes one audit entry, so a DPO
 * can answer "who opened this record, and when". Aggregate and metadata-only
 * reads are deliberately absent.
 */
const VIEWS: Record<string, { action: string; entity: string }> = {
  'TaxpayersController.findAll': { action: 'VIEW_TAXPAYER_LIST', entity: 'Taxpayer' },
  'TaxpayersController.findOne': { action: 'VIEW_TAXPAYER', entity: 'Taxpayer' },
  'Taxpayer360Controller.search': { action: 'SEARCH_TAXPAYER_360', entity: 'Taxpayer' },
  'Taxpayer360Controller.profile': { action: 'VIEW_TAXPAYER_360', entity: 'Taxpayer' },
  'DataRecordsController.findAll': { action: 'VIEW_DATA_RECORD_LIST', entity: 'DataRecord' },
  'DataRecordsController.findOne': { action: 'VIEW_DATA_RECORD', entity: 'DataRecord' },
  'CasesController.findAll': { action: 'VIEW_CASE_LIST', entity: 'UnderdeclarationCase' },
  'CasesController.findOne': { action: 'VIEW_CASE', entity: 'UnderdeclarationCase' },
  'CasesController.listDocuments': { action: 'VIEW_CASE_DOCUMENTS', entity: 'UnderdeclarationCase' },
  'SubmissionsController.findOne': { action: 'VIEW_SUBMISSION', entity: 'DataSubmission' },
  'LinkageController.byIdentifier': { action: 'SEARCH_LINKAGE_IDENTIFIER', entity: 'DataRecord' },
  'LinkageController.byName': { action: 'SEARCH_LINKAGE_NAME', entity: 'DataRecord' },
  'TaxNetController.report': { action: 'VIEW_TAX_NET', entity: 'Taxpayer' },
  'DeclaredIncomeController.findAll': { action: 'VIEW_DECLARED_INCOME', entity: 'DeclaredIncome' },
  'TriageController.list': { action: 'VIEW_TRIAGE', entity: 'TriageRecommendation' },
  'AgentsController.signals': { action: 'VIEW_AGENT_SIGNALS', entity: 'AgentSignal' },
  'CrossStateController.candidates': { action: 'VIEW_CROSS_STATE_CANDIDATES', entity: 'Taxpayer' },
  'CrossStateController.list': { action: 'VIEW_CROSS_STATE_REFERRALS', entity: 'CrossStateReferral' },
};

/** Query keys whose values are safe to store as given; anything else may be a name or identifier. */
const PLAIN_KEYS = new Set([
  'page', 'limit', 'year', 'status', 'flagged', 'reviewStatus', 'providerId', 'taxpayerId', 'submissionId',
  'type', 'sort', 'order', 'direction', 'risk', 'riskLevel', 'assigneeId', 'stage', 'sector', 'state', 'period',
]);
const MAX_IDS = 100;

/**
 * Records staff views of personal data in the audit chain. Search terms are
 * stored as blind indexes, never in the clear: the log must not become a
 * plaintext copy of the NINs and names people searched for. To ask "who
 * searched for X", compute blindIndex(X) and match it.
 */
@Injectable()
export class RecordViewInterceptor implements NestInterceptor {
  constructor(private audit: AuditService, private crypto: CryptoService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    if (context.getType() !== 'http') return next.handle();
    const req = context.switchToHttp().getRequest();
    const view = req?.method === 'GET' ? VIEWS[`${context.getClass().name}.${context.getHandler().name}`] : undefined;
    const user = req?.user;
    if (!view || !user?.id || user.providerId) return next.handle();

    return next.handle().pipe(
      tap((body) => {
        const ids = this.idsOf(body);
        // Fire-and-forget: the audit write is serialised behind a lock and must
        // not add its wait to the response. log() never throws.
        void this.audit.log({
          actorType: 'STAFF', actorId: user.id, staffId: user.id,
          action: view.action, entity: view.entity, entityId: req.params?.id,
          afterJson: {
            query: this.safeQuery(req.query),
            returned: ids.total,
            ids: ids.list,
            ...(ids.total > ids.list.length ? { idsTruncated: true } : {}),
          },
          ip: req.ip, userAgent: req.headers?.['user-agent'],
        });
      }),
    );
  }

  private safeQuery(q: Record<string, unknown> = {}) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(q)) {
      if (v == null || v === '') continue;
      if (PLAIN_KEYS.has(k)) out[k] = v;
      else out[`${k}Index`] = this.crypto.blindIndex(String(v).trim());
    }
    return out;
  }

  /** The record ids a response exposed, whatever its envelope. */
  private idsOf(body: any): { total: number; list: string[] } {
    let rows: any[] | null = Array.isArray(body) ? body : null;
    if (!rows && body && typeof body === 'object') {
      for (const k of ['data', 'items', 'records', 'results', 'rows', 'taxpayers', 'cases', 'clusters']) {
        if (Array.isArray(body[k])) { rows = body[k]; break; }
      }
    }
    if (!rows) return { total: body ? 1 : 0, list: body?.id ? [String(body.id)] : [] };
    const list = rows
      .slice(0, MAX_IDS)
      .map((r) => r?.id ?? r?.taxpayerId ?? r?.caseId)
      .filter((v) => v != null)
      .map(String);
    return { total: rows.length, list };
  }
}
