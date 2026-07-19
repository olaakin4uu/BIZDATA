'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import PageHeader from '@/components/PageHeader';
import DataTable, { type Column } from '@/components/DataTable';
import { usersApi, type StaffUserRecord } from '@/lib/api/users';
import { STAFF_ROLES, formatDateTime } from '@/lib/utils';

export default function UsersListPage() {
  const [rows, setRows] = useState<StaffUserRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const [loading, setLoading] = useState(false);
  const limit = 50;

  const load = () => {
    setLoading(true);
    usersApi.list({ search: search || undefined, role: role || undefined, page, limit })
      .then((r) => { setRows(r.users); setTotal(r.total); })
      .catch(() => { setRows([]); setTotal(0); })
      .finally(() => setLoading(false));
  };

  useEffect(load, [page, role]);

  const columns: Column<StaffUserRecord>[] = [
    { key: 'name', header: 'Name', cell: (r) => <Link href={`/users/${r.id}`} className="font-medium text-slate-800 hover:text-teal-700">{r.firstName} {r.lastName}</Link> },
    { key: 'email', header: 'Email', cell: (r) => <span className="text-xs text-slate-600">{r.email}</span> },
    { key: 'role', header: 'Role', cell: (r) => <span className="text-xs">{r.role.replace(/_/g, ' ')}</span> },
    {
      key: 'status', header: 'Status',
      cell: (r) => (
        <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${r.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
          {r.isActive ? 'Active' : 'Disabled'}
        </span>
      ),
    },
    { key: 'login', header: 'Last login', cell: (r) => <span className="text-xs text-slate-500">{formatDateTime(r.lastLoginAt)}</span> },
  ];

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <PageHeader
        title="Staff users"
        subtitle="People who can sign in to the FinData back office."
        actions={
          <Link href="/users/new" className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold rounded-lg">
            + New user
          </Link>
        }
      />

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 mb-4 flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[180px]">
          <label className="block text-xs font-medium text-slate-600 mb-1">Search</label>
          <input
            value={search} onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { setPage(1); load(); } }}
            placeholder="Name or email…"
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Role</label>
          <select value={role} onChange={(e) => { setRole(e.target.value); setPage(1); }}
            className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white">
            <option value="">All roles</option>
            {STAFF_ROLES.map((r) => <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>)}
          </select>
        </div>
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        loading={loading}
        emptyText="No staff users found."
        total={total}
        page={page}
        limit={limit}
        onPageChange={setPage}
      />
    </div>
  );
}
