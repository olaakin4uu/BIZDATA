import { apiFetch } from './client';

export interface FieldCoverage {
  field: string;
  label: string;
  present: number;
  missing: number;
  /** Percentage of submitted rows carrying this field. */
  coverage: number;
  /** Distinct values, via the blind index — null where no index backs the column. */
  distinct: number | null;
  note: string;
}

export interface CoverageRow {
  providerId?: string;
  providerName?: string;
  providerType?: string;
  year?: number;
  records: number;
  ninCoverage: number;
  bvnCoverage: number;
  accountCoverage: number;
  nameCoverage: number;
  matchedPct: number;
  noIdentifier: number;
  distinctCustomers: number;
  avgConfidence: number | null;
}

export interface IdentifierQuality {
  scope: { year: number | null; providerId: string | null; records: number; providers: number };
  recordFields: FieldCoverage[];
  matchQuality: {
    matched: number;
    matchedPct: number;
    unmatched: number;
    noIdentifier: number;
    noIdentifierPct: number;
    avgConfidence: number | null;
    byMethod: { method: string; records: number; share: number; avgConfidence: number | null }[];
  };
  register: {
    taxpayers: number;
    withTin: number; withTinPct: number;
    withNin: number; withNinPct: number;
    withBvn: number; withBvnPct: number;
    withRc: number; withRcPct: number;
    identityVerified: number; identityVerifiedPct: number;
    corporates: number; corporatesWithRc: number; corporatesWithRcPct: number;
  };
  byProvider: CoverageRow[];
  byYear: CoverageRow[];
}

export const dataQualityApi = {
  identifiers: (q: { year?: number } = {}) =>
    apiFetch<IdentifierQuality>(`/data-quality/identifiers${q.year ? `?year=${q.year}` : ''}`),
};
