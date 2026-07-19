'use client';
import { useEffect, useState, use as usePromise } from 'react';
import Link from 'next/link';
import PageHeader from '@/components/PageHeader';
import PasswordInput from '@/components/PasswordInput';
import { usersApi, type StaffUserRecord } from '@/lib/api/users';
import { STAFF_ROLES, formatDateTime, extractErrorMessage } from '@/lib/utils';

export default function UserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = usePromise(params);
  const [user, setUser] = useState<StaffUserRecord | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  // Edit form
  const [form, setForm] = useState({ firstName: '', lastName: '', phone: '', role: '' });
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [saveErr, setSaveErr] = useState<string | null>(null);

  // Reset password
  const [newPw, setNewPw] = useState('');
  const [pwBusy, setPwBusy] = useState(false);
  const [pwMsg, setPwMsg] = useState<string | null>(null);
  const [pwErr, setPwErr] = useState<string | null>(null);

  const load = () => {
    setLoadErr(null);
    usersApi.get(id)
      .then((u) => {
        setUser(u);
        setForm({ firstName: u.firstName, lastName: u.lastName, phone: u.phone ?? '', role: u.role });
      })
      .catch((e) => setLoadErr(extractErrorMessage(e)));
  };
  useEffect(load, [id]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveBusy(true); setSaveErr(null); setSaveMsg(null);
    try {
      const u = await usersApi.update(id, {
        firstName: form.firstName,
        lastName: form.lastName,
        phone: form.phone || null,
        role: form.role,
      } as Partial<StaffUserRecord>);
      setUser(u);
      setSaveMsg('Saved.');
    } catch (err) {
      setSaveErr(extractErrorMessage(err));
    } finally {
      setSaveBusy(false);
    }
  };

  const toggleActive = async () => {
    if (!user) return;
    setSaveErr(null);
    try {
      const u = await usersApi.update(id, { isActive: !user.isActive } as Partial<StaffUserRecord>);
      setUser(u);
    } catch (err) {
      setSaveErr(extractErrorMessage(err));
    }
  };

  const resetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwBusy(true); setPwErr(null); setPwMsg(null);
    if (newPw.length < 8) { setPwErr('Password must be at least 8 characters'); setPwBusy(false); return; }
    try {
      await usersApi.resetPassword(id, newPw);
      setPwMsg('Password reset. The user must set their own on next sign-in, and their existing sessions were ended.');
      setNewPw('');
    } catch (err) {
      setPwErr(extractErrorMessage(err));
    } finally {
      setPwBusy(false);
    }
  };

  if (loadErr) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <Link href="/users" className="text-sm text-teal-700 hover:underline">← All users</Link>
        <div className="mt-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{loadErr}</div>
      </div>
    );
  }
  if (!user) return <div className="p-6 text-sm text-slate-400">Loading…</div>;

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <Link href="/users" className="text-sm text-teal-700 hover:underline">← All users</Link>
      <PageHeader
        title={`${user.firstName} ${user.lastName}`}
        subtitle={`${user.email} · ${user.role.replace(/_/g, ' ')} · last login ${formatDateTime(user.lastLoginAt)}`}
      />

      <div className="flex items-center gap-3 mb-6">
        <span className={`inline-flex px-2.5 py-1 text-xs font-medium rounded-full ${user.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
          {user.isActive ? 'Active' : 'Disabled'}
        </span>
        <button onClick={toggleActive}
          className={`text-xs font-semibold px-3 py-1.5 rounded-lg ${user.isActive ? 'bg-rose-50 text-rose-700 hover:bg-rose-100' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'}`}>
          {user.isActive ? 'Disable account' : 'Enable account'}
        </button>
      </div>

      {/* Edit details */}
      <section className="mb-8">
        <h2 className="text-sm font-semibold text-slate-800 mb-3">Details</h2>
        <form onSubmit={save} className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-3">
          {saveErr && <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{saveErr}</div>}
          {saveMsg && <div className="px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-700">{saveMsg}</div>}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="First name"><input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" /></Field>
            <Field label="Last name"><input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" /></Field>
            <Field label="Phone"><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" /></Field>
            <Field label="Role">
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white">
                {STAFF_ROLES.map((r) => <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>)}
              </select>
            </Field>
          </div>
          <button type="submit" disabled={saveBusy} className="px-5 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold rounded-lg disabled:opacity-50">
            {saveBusy ? 'Saving…' : 'Save changes'}
          </button>
        </form>
      </section>

      {/* Reset password */}
      <section>
        <h2 className="text-sm font-semibold text-slate-800 mb-1">Reset password</h2>
        <p className="text-xs text-slate-500 mb-3">
          Sets a temporary password. The user is forced to choose their own on next sign-in, and any active sessions are ended immediately.
        </p>
        <form onSubmit={resetPassword} className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-3 max-w-sm">
          {pwErr && <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{pwErr}</div>}
          {pwMsg && <div className="px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-700">{pwMsg}</div>}
          <Field label="Temporary password" hint="At least 8 characters.">
            <PasswordInput required minLength={8} value={newPw} onChange={(e) => setNewPw(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
          </Field>
          <button type="submit" disabled={pwBusy} className="px-5 py-2 bg-slate-800 hover:bg-slate-900 text-white text-sm font-semibold rounded-lg disabled:opacity-50">
            {pwBusy ? 'Resetting…' : 'Reset password'}
          </button>
        </form>
      </section>
    </div>
  );
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-700 mb-1">{label}</label>
      {children}
      {hint && <p className="text-xs text-slate-400 mt-1">{hint}</p>}
    </div>
  );
}
