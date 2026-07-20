import { apiFetch } from './client';

export type CaseStatus =
  | 'OPEN' | 'UNDER_REVIEW' | 'NOTICE_ISSUED' | 'OBJECTION'
  | 'CONFIRMED' | 'SETTLED' | 'RECOVERED' | 'DISMISSED' | 'CLOSED';

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface CaseReason {
  code: string;
  label: string;
  weight: number;
}

export interface CaseTaxpayer {
  id: string;
  type: string;
  firstName?: string | null;
  lastName?: string | null;
  businessName?: string | null;
  tin?: string | null;
  stateOfResidence?: string | null;
}

export interface UnderdeclarationCase {
  id: string;
  taxpayerId: string;
  year: number;
  scanId?: string | null;
  observedIncome: string;
  declaredIncome: string;
  discrepancyAmount: string;
  discrepancyPct: string;
  estimatedTaxDue: string;
  taxBasis?: string | null;        // 'PIT_GRADUATED' | 'NOT_ASSESSED_LLC'
  altTaxRate?: string | null;      // configurable flat comparison rate (seeded from CIT)
  altTaxDue?: string | null;       // the gap taxed at altTaxRate
  confidence: string;
  agentScore?: string | null;
  reasons?: CaseReason[] | null;
  providerCount: number;
  engineVersion?: string | null;
  status: CaseStatus;
  riskLevel: RiskLevel;
  assignedToId?: string | null;
  recoveredAmount?: string | null;
  assessedTax?: string | null;
  penaltyAmount?: string | null;
  assessedTotal?: string | null;
  demandNoticeRef?: string | null;
  noticeIssuedAt?: string | null;
  objectionDueAt?: string | null;
  authorityResponseDueAt?: string | null;
  resolvedAt?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
  taxpayer?: CaseTaxpayer;
  assignedTo?: { id: string; firstName: string; lastName: string } | null;
  scan?: { id: string; startedAt: string; threshold: string; engineVersion?: string | null } | null;
}

export interface CaseStats {
  totalCases: number;
  openCases: number;
  dismissedCases: number;
  revenueAtRisk: number;
  recovered: number;
  estimatedTaxTotal: number;
  funnel: { stage: string; count: number }[];
  byStatus: { status: CaseStatus; count: number; estimatedTax: number }[];
  byRisk: { riskLevel: RiskLevel; count: number }[];
}

export const casesApi = {
  stats: (year?: number) => apiFetch<CaseStats>(`/cases/stats${year ? `?year=${year}` : ''}`),
  list: (
    params: { year?: number; status?: CaseStatus; riskLevel?: RiskLevel; sort?: 'estimatedTaxDue' | 'confidence'; page?: number; limit?: number } = {},
  ) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && String(v) !== '') qs.set(k, String(v));
    });
    const q = qs.toString();
    return apiFetch<{ cases: UnderdeclarationCase[]; total: number; page: number; limit: number }>(
      `/cases${q ? `?${q}` : ''}`,
    );
  },
  get: (id: string) => apiFetch<UnderdeclarationCase>(`/cases/${id}`),
  transition: (id: string, to: CaseStatus, opts: { notes?: string; recoveredAmount?: number } = {}) =>
    apiFetch<UnderdeclarationCase>(`/cases/${id}/status`, { method: 'PATCH', body: { to, ...opts } }),
  assign: (id: string, assignedToId: string | null) =>
    apiFetch<UnderdeclarationCase>(`/cases/${id}/assign`, { method: 'PATCH', body: { assignedToId } }),

  // Objection documents (Document Intelligence)
  listDocuments: (id: string) => apiFetch<CaseDocument[]>(`/cases/${id}/documents`),
  addDocument: (id: string, args: { file?: File; pastedText?: string }) => {
    if (args.file) {
      const fd = new FormData();
      fd.append('file', args.file);
      if (args.pastedText) fd.append('pastedText', args.pastedText);
      return apiFetch<AddDocumentResult>(`/cases/${id}/documents`, { method: 'POST', body: fd });
    }
    return apiFetch<AddDocumentResult>(`/cases/${id}/documents`, { method: 'POST', body: { pastedText: args.pastedText } });
  },
};

export interface CaseDocument {
  id: string;
  fileName: string;
  mimeType?: string | null;
  fileSizeBytes?: number | null;
  extractionSource?: string | null;
  declaredIncome?: string | null;
  variance?: string | null;
  consistent?: boolean | null;
  reconcileNote?: string | null;
  assetDisposals?: string | null;
  cgtAssessed?: string | null;
  createdAt: string;
}
export interface CgtAssessment {
  proceeds: number;
  rate: number;
  cgt: number;
  note: string;
}
export interface AddDocumentResult {
  id: string;
  fileName: string;
  extractionSource: string;
  extracted: { declaredIncome?: number; expenses?: number; assetDisposals?: number };
  reconciliation: { variance: number; consistent: boolean; note: string };
  cgt: CgtAssessment | null;
  signalRaised: boolean;
}

/** Format a kobo-precise NGN string/number into a compact ₦ label. */
export function formatNaira(value: string | number | null | undefined): string {
  const n = typeof value === 'string' ? Number(value) : value ?? 0;
  if (!n) return '₦0';
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return `₦${(n / 1_000_000_000).toFixed(2)}bn`;
  if (abs >= 1_000_000) return `₦${(n / 1_000_000).toFixed(1)}m`;
  if (abs >= 1_000) return `₦${(n / 1_000).toFixed(0)}k`;
  return `₦${n.toLocaleString()}`;
}

export function caseDisplayName(c: Pick<UnderdeclarationCase, 'taxpayer'>): string {
  const t = c.taxpayer;
  if (!t) return 'Unknown taxpayer';
  return t.businessName || [t.firstName, t.lastName].filter(Boolean).join(' ') || 'Unknown taxpayer';
}
