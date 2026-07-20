'use client';
import { useEffect, useState } from 'react';
import PageHeader from '@/components/PageHeader';
import LoadingSpinner from '@/components/LoadingSpinner';
import { schemasApi, type ProviderSchema } from '@/lib/api/schemas';
import { extractErrorMessage, formatDateTime } from '@/lib/utils';

export default function SchemasPage() {
  const [rows, setRows] = useState<ProviderSchema[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<ProviderSchema | null>(null);
  const [columnsJson, setColumnsJson] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [active, setActive] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    schemasApi.list()
      .then(setRows)
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const openEdit = (s: ProviderSchema) => {
    setEditing(s);
    setName(s.name);
    setDescription(s.description ?? '');
    setColumnsJson(JSON.stringify(s.columns, null, 2));
    setActive(s.isActive);
    setError(null);
  };

  const save = async () => {
    if (!editing) return;
    setBusy(true); setError(null);
    try {
      const cols = JSON.parse(columnsJson);
      if (!Array.isArray(cols)) throw new Error('Columns must be a JSON array');
      await schemasApi.upsert(editing.providerType, {
        name,
        description: description || null,
        columns: cols,
        isActive: active,
      });
      setEditing(null);
      load();
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <PageHeader
        title="Provider schemas"
        subtitle="CSV column expectations applied during submission ingestion. One schema per provider type."
      />

      {loading ? (
        <LoadingSpinner />
      ) : rows.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm py-12 text-center text-xs text-slate-400">
          No schema templates configured yet.
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                {['Provider type', 'Name', 'Columns', 'Active', 'Updated', ''].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((s) => (
                <tr key={s.id ?? s.providerType} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-mono text-xs">{s.providerType}</td>
                  <td className="px-4 py-3 text-sm font-medium">{s.name}</td>
                  <td className="px-4 py-3 text-xs text-slate-600">{Array.isArray(s.columns) ? s.columns.length : 0} columns</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${s.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                      {s.isActive ? 'Yes' : 'No'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">{formatDateTime(s.updatedAt)}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => openEdit(s)} className="text-xs text-teal-700 hover:underline font-medium">
                      Edit columns
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <div>
                <h3 className="font-semibold text-slate-800">Edit schema · {editing.providerType}</h3>
                <p className="text-xs text-slate-500 mt-0.5">Define the CSV columns the parser expects.</p>
              </div>
              <button onClick={() => setEditing(null)} className="text-slate-400 hover:text-slate-600 text-lg">✕</button>
            </div>
            <div className="overflow-y-auto p-6 space-y-3 flex-1">
              {error && <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Name</label>
                <input value={name} onChange={(e) => setName(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Description</label>
                <input value={description} onChange={(e) => setDescription(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="rounded border-slate-300" />
                Active <span className="text-xs text-slate-400">— inactive schemas are not used to validate incoming submissions</span>
              </label>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Columns (JSON array of {`{ name, type, required?, validation? }`})
                </label>
                <textarea
                  value={columnsJson} onChange={(e) => setColumnsJson(e.target.value)}
                  rows={18}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono"
                />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-200 flex gap-2 justify-end">
              <button onClick={() => setEditing(null)} className="px-4 py-2 border border-slate-300 text-sm rounded-lg hover:bg-slate-50">
                Cancel
              </button>
              <button onClick={save} disabled={busy} className="px-5 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold rounded-lg disabled:opacity-50">
                {busy ? 'Saving…' : 'Save schema'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
