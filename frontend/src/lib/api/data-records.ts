import { apiFetch } from './client';

export interface DataRecord {
  id: string;
  submissionId: string;
  providerId: string;
  providerType: string;
  taxpayerId?: string | null;
  accountNumber?: string | null;
  bvn?: string | null;
  nin?: string | null;
  phoneNumber?: string | null;
  walletId?: string | null;
  merchantId?: string | null;
  accountName?: string | null;
  periodLabel: string;
  periodYear: number;
  totalInflow?: string | null;
  totalOutflow?: string | null;
  openingBalance?: string | null;
  closingBalance?: string | null;
  transactionCount?: number | null;
  payload?: unknown;
  flaggedAsUnderdeclared: boolean;
  declaredIncome?: string | null;
  discrepancyAmount?: string | null;
  discrepancyPct?: string | null;
  flaggedAt?: string | null;
  reviewStatus?: 'PENDING_REVIEW' | 'CLEARED' | 'CONFIRMED' | null;
  reviewedById?: string | null;
  reviewedAt?: string | null;
  reviewNotes?: string | null;
  createdAt: string;
  updatedAt: string;
  provider?: { id: string; name: string; providerType: string };
  taxpayer?: {
    id: string;
    nin?: string | null;
    cacRcNumber?: string | null;
    businessName?: string | null;
    firstName?: string | null;
    lastName?: string | null;
  } | null;
  reviewedBy?: { id: string; firstName: string; lastName: string; email?: string } | null;
  submission?: { id: string; periodLabel: string; fileName?: string | null; receivedAt: string };
}

export interface DataRecordStats {
  total: number;
  flagged: number;
  pendingReview: number;
  confirmed: number;
  cleared: number;
}

export const dataRecordsApi = {
  list: (
    params: {
      providerId?: string;
      providerType?: string;
      periodYear?: number;
      taxpayerId?: string;
      flagged?: 'true' | 'false';
      reviewStatus?: string;
      page?: number;
      limit?: number;
    } = {},
  ) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
    });
    const q = qs.toString();
    return apiFetch<{ records: DataRecord[]; total: number; page: number; limit: number }>(
      `/data-records${q ? `?${q}` : ''}`,
    );
  },
  get: (id: string) => apiFetch<DataRecord>(`/data-records/${id}`),
  stats: () => apiFetch<DataRecordStats>('/data-records/stats'),
  review: (id: string, reviewStatus: 'CLEARED' | 'CONFIRMED', reviewNotes?: string) =>
    apiFetch<DataRecord>(`/data-records/${id}/review`, {
      method: 'PATCH',
      body: { reviewStatus, reviewNotes },
    }),
};
