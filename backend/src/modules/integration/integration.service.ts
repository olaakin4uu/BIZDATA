import { Injectable, BadRequestException, NotFoundException, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/services/audit.service';
import { CasesService } from '../cases/cases.service';

/**
 * Taxpayer-integration API. BIZDATA is the assessment engine; a partner platform
 * (the taxpayer's own portal) calls this API on the taxpayer's behalf. Security
 * is two-layered:
 *   1. A partner API key authenticates the calling platform (x-api-key).
 *   2. A per-case access token, issued when a demand notice is created, scopes
 *      each request to exactly one case (x-case-token) — so a partner can never
 *      enumerate arbitrary taxpayers.
 */
@Injectable()
export class IntegrationService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private cases: CasesService,
  ) {}

  private hash(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }

  // ─── API KEY MANAGEMENT (staff-facing) ────────────────────────────────────

  /** Mint a new partner key. The raw key is returned ONCE and never stored. */
  async createApiKey(name: string, staffId?: string) {
    if (!name?.trim()) throw new BadRequestException('A partner name is required');
    const raw = `biz_${randomBytes(24).toString('hex')}`; // 48 hex chars
    const rec = await this.prisma.integrationApiKey.create({
      data: { name: name.trim(), keyHash: this.hash(raw), keyPrefix: raw.slice(0, 12), createdById: staffId ?? null },
    });
    await this.audit.log({
      actorType: 'STAFF', actorId: staffId, staffId,
      action: 'CREATE_API_KEY', entity: 'IntegrationApiKey', entityId: rec.id, afterJson: { name },
    });
    // raw key returned once — the partner stores it; we keep only the hash.
    return { id: rec.id, name: rec.name, apiKey: raw, keyPrefix: rec.keyPrefix, createdAt: rec.createdAt };
  }

  async listApiKeys() {
    const rows = await this.prisma.integrationApiKey.findMany({ orderBy: { createdAt: 'desc' } });
    return rows.map((r) => ({ id: r.id, name: r.name, keyPrefix: r.keyPrefix, isActive: r.isActive, lastUsedAt: r.lastUsedAt, createdAt: r.createdAt }));
  }

  async revokeApiKey(id: string, staffId?: string) {
    const r = await this.prisma.integrationApiKey.findUnique({ where: { id } });
    if (!r) throw new NotFoundException('Key not found');
    await this.prisma.integrationApiKey.update({ where: { id }, data: { isActive: false } });
    await this.audit.log({ actorType: 'STAFF', actorId: staffId, staffId, action: 'REVOKE_API_KEY', entity: 'IntegrationApiKey', entityId: id });
    return { success: true };
  }

  /** Authenticate a partner request by its API key. Throws if invalid/revoked. */
  async authenticatePartner(rawKey: string | undefined) {
    if (!rawKey) throw new UnauthorizedException('Missing API key.');
    const rec = await this.prisma.integrationApiKey.findUnique({ where: { keyHash: this.hash(rawKey) } });
    if (!rec || !rec.isActive) throw new UnauthorizedException('Invalid or revoked API key.');
    // Touch last-used (best-effort).
    this.prisma.integrationApiKey.update({ where: { id: rec.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
    return rec;
  }

  // ─── CASE TOKEN ───────────────────────────────────────────────────────────

  /** Resolve a case by its scoped access token. */
  private async caseByToken(caseToken: string | undefined) {
    if (!caseToken) throw new UnauthorizedException('Missing case access token.');
    const kase = await this.prisma.underdeclarationCase.findUnique({
      where: { caseAccessToken: caseToken },
      include: { taxpayer: { select: { id: true, businessName: true, firstName: true, lastName: true, type: true } } },
    });
    if (!kase) throw new UnauthorizedException('Invalid case access token.');
    return kase;
  }

  private taxpayerName(t: any): string {
    return t?.type === 'CORPORATE' ? (t.businessName ?? '—') : [t?.firstName, t?.lastName].filter(Boolean).join(' ') || '—';
  }

  // ─── TAXPAYER-FACING OPERATIONS (partner-authenticated + case-scoped) ──────

  /** The demand notice for the taxpayer's case. */
  async getNotice(caseToken: string, partnerName: string) {
    const c = await this.caseByToken(caseToken);
    if (!c.demandNoticeRef) throw new ForbiddenException('No demand notice has been issued for this case yet.');
    await this.audit.log({
      actorType: 'SYSTEM', action: 'INTEGRATION_VIEW_NOTICE', entity: 'UnderdeclarationCase', entityId: c.id,
      afterJson: { partner: partnerName },
    });
    return {
      noticeRef: c.demandNoticeRef,
      taxpayer: this.taxpayerName(c.taxpayer),
      year: c.year,
      status: c.status,
      observedIncome: c.observedIncome,
      declaredIncome: c.declaredIncome,
      discrepancy: c.discrepancyAmount,
      assessedTax: c.assessedTax,
      penalty: c.penaltyAmount,
      demandTotal: c.assessedTotal,
      basis: c.assessmentBasis,
      issuedAt: c.noticeIssuedAt,
      objectionDueAt: c.objectionDueAt,
      canObject: c.status === 'NOTICE_ISSUED' && (!c.objectionDueAt || c.objectionDueAt > new Date()),
    };
  }

  /** File an objection — moves the case to OBJECTION and starts the §41(6) clock. */
  async fileObjection(caseToken: string, grounds: string, partnerName: string) {
    const c = await this.caseByToken(caseToken);
    if (c.status !== 'NOTICE_ISSUED') {
      throw new BadRequestException(`An objection can only be filed while a notice is open (current status: ${c.status}).`);
    }
    if (c.objectionDueAt && c.objectionDueAt < new Date()) {
      throw new BadRequestException('The objection window has closed.');
    }
    if (!grounds?.trim()) throw new BadRequestException('Objection grounds are required.');

    // Record the grounds, then run the existing lifecycle transition (which sets
    // the authority-response deadline from the active statutory config).
    await this.prisma.underdeclarationCase.update({
      where: { id: c.id }, data: { objectionGrounds: grounds.trim(), objectionFiledAt: new Date() },
    });
    await this.cases.transition(c.id, { to: 'OBJECTION', notes: `Objection filed via ${partnerName}` }, /* staffId */ undefined as any);

    await this.audit.log({
      actorType: 'SYSTEM', action: 'INTEGRATION_FILE_OBJECTION', entity: 'UnderdeclarationCase', entityId: c.id,
      afterJson: { partner: partnerName },
    });
    const updated = await this.prisma.underdeclarationCase.findUnique({ where: { id: c.id } });
    return { status: updated?.status, authorityResponseDueAt: updated?.authorityResponseDueAt, message: 'Objection received. The authority will respond within the statutory window.' };
  }

  /** Upload a supporting document — feeds the Document Intelligence pipeline. */
  async uploadDocument(caseToken: string, file: any, pastedText: string | undefined, partnerName: string) {
    const c = await this.caseByToken(caseToken);
    // Reuse the case document pipeline (extract → reconcile → signal).
    const result = await this.cases.addDocument(c.id, file, { pastedText, staffId: undefined });
    await this.audit.log({
      actorType: 'SYSTEM', action: 'INTEGRATION_UPLOAD_DOCUMENT', entity: 'UnderdeclarationCase', entityId: c.id,
      afterJson: { partner: partnerName, consistent: result.reconciliation.consistent },
    });
    return {
      received: true,
      fileName: result.fileName,
      reconciliation: { consistent: result.reconciliation.consistent, note: result.reconciliation.note },
    };
  }

  /** The current outcome of the case, for the taxpayer to check. */
  async getOutcome(caseToken: string, partnerName: string) {
    const c = await this.caseByToken(caseToken);
    const OUTCOME: Record<string, string> = {
      OBJECTION: 'Under review by the authority.',
      CONFIRMED: 'Assessment confirmed — the demand stands.',
      DISMISSED: 'Objection upheld — the assessment was dismissed.',
      SETTLED: 'Settled.',
      RECOVERED: 'Settled and recovered.',
      CLOSED: 'Closed.',
    };
    return {
      noticeRef: c.demandNoticeRef,
      status: c.status,
      outcome: OUTCOME[c.status] ?? 'In progress.',
      objectionFiledAt: c.objectionFiledAt,
      authorityResponseDueAt: c.authorityResponseDueAt,
      resolvedAt: c.resolvedAt,
    };
  }
}
