import { apiFetch } from './client';

export interface LinkageQuery {
  year?: number;
  minAccounts?: number;
  multiProviderOnly?: boolean;
  limit?: number;
}

/** One customer, identified by the NIN/BVN their providers reported. */
export interface IdentifierLinkageRow {
  idType: 'NIN' | 'BVN';
  /** Short prefix of the blind index — stable row key, not reversible to the identifier. */
  idRef: string;
  accounts: number;
  providers: number;
  providerNames: string[];
  records: number;
  inflow: number;
  outflow: number;
  flagged: number;
  /** >1 means entity resolution split one identifier across several taxpayer records. */
  taxpayers: number;
  names: string[];
  firstYear: number;
  lastYear: number;
}

/** A cluster of accounts sharing a normalised name — a lead, not a finding. */
export interface NameLinkageRow {
  nameKey: string;
  nameVariants: string[];
  accounts: number;
  providers: number;
  providerNames: string[];
  records: number;
  inflow: number;
  taxpayers: number;
  distinctIds: number;
  idAgreement: 'SAME_ID' | 'CONFLICTING' | 'NO_ID';
}

export interface LinkageResult<T> {
  rows: T[];
  total: number;
  truncated?: boolean;
}

function qs(q: LinkageQuery): string {
  const p = new URLSearchParams();
  if (q.year) p.set('year', String(q.year));
  if (q.minAccounts) p.set('minAccounts', String(q.minAccounts));
  if (q.multiProviderOnly) p.set('multiProviderOnly', 'true');
  if (q.limit) p.set('limit', String(q.limit));
  const s = p.toString();
  return s ? `?${s}` : '';
}

export const linkageApi = {
  byIdentifier: (q: LinkageQuery = {}) =>
    apiFetch<LinkageResult<IdentifierLinkageRow>>(`/linkage/by-identifier${qs(q)}`),
  byName: (q: LinkageQuery = {}) =>
    apiFetch<LinkageResult<NameLinkageRow>>(`/linkage/by-name${qs(q)}`),
};
