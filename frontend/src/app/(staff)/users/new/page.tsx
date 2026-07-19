'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import PageHeader from '@/components/PageHeader';
import PasswordInput from '@/components/PasswordInput';
import { usersApi } from '@/lib/api/users';
import { STAFF_ROLES, extractErrorMessage } from '@/lib/utils';

export default function NewStaffUserPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    phone: '',
    role: 'READONLY',
    isActive: true,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.password.length < 8) { setError('Password must be at least 8 characters'); return; }
    setBusy(true); setError(null);
    try {
      await usersApi.create(form);
      router.push('/users');
    } catch (err) {
      setError(extractErrorMessage(err));
      setBusy(false);
    }
  };

  return (
    <div className="p-6 max-w-xl mx-auto">
      <PageHeader
        title="Create staff user"
        actions={<Link href="/users" className="text-sm text-slate-600 hover:text-slate-900">← Back</Link>}
      />
      <form onSubmit={submit} className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
        {error && <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Text label="First name" required value={form.firstName} onChange={(v) => setForm({ ...form, firstName: v })} />
          <Text label="Last name" required value={form.lastName} onChange={(v) => setForm({ ...form, lastName: v })} />
        </div>
        <Text label="Email" required type="email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} />
        <Text label="Initial password" required type="password" value={form.password} onChange={(v) => setForm({ ...form, password: v })} hint="At least 8 characters." />
        <Text label="Phone" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} />
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">Role</label>
          <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white">
            {STAFF_ROLES.map((r) => <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>)}
          </select>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
          Active
        </label>
        <div className="flex gap-2">
          <button type="submit" disabled={busy}
            className="px-5 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold rounded-lg disabled:opacity-50">
            {busy ? 'Creating…' : 'Create user'}
          </button>
          <Link href="/users" className="px-5 py-2 border border-slate-300 text-sm rounded-lg hover:bg-slate-50">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}

function Text({
  label, value, onChange, required, type = 'text', hint,
}: {
  label: string; value: string; onChange: (v: string) => void; required?: boolean; type?: string; hint?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-700 mb-1">
        {label}{required && <span className="text-red-500 ml-1">*</span>}
      </label>
      {type === 'password' ? (
        <PasswordInput
          required={required} value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
        />
      ) : (
        <input
          type={type} required={required} value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
        />
      )}
      {hint && <p className="text-xs text-slate-400 mt-1">{hint}</p>}
    </div>
  );
}
