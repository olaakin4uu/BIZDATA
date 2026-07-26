'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/Button';
import { Input, Select, Textarea } from '@/components/Field';
import PasswordInput from '@/components/PasswordInput';
import {
  adminApi,
  adminToken,
  TOPIC_LABEL,
  type AdminQuestion,
  type AdminStats,
  type QuestionInput,
  type ResultDetail,
  type ResultRow,
} from '../lib';

const TOPICS = ['EXCEL', 'WORD', 'CYBERSECURITY', 'TAX'];

function exportResultsCsv(rows: ResultRow[]) {
  const head = ['Candidate', 'Access code', 'Label', 'Email', 'Status', 'Part 1', 'Part 2', 'Total %', 'Passed', 'Started', 'Submitted'];
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = rows.map((r) =>
    [r.fullName, r.accessCode, r.label, r.email, r.status, r.part1Score, r.part2Score, r.totalScore, r.passed ? 'Yes' : 'No', r.startedAt, r.submittedAt]
      .map(esc)
      .join(','),
  );
  const csv = [head.map(esc).join(','), ...lines].join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'assessment-results.csv';
  a.click();
  URL.revokeObjectURL(url);
}

export default function AdminPage() {
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    if (!adminToken.get()) {
      setAuthed(false);
      return;
    }
    adminApi
      .stats()
      .then(() => setAuthed(true))
      .catch(() => {
        adminToken.clear();
        setAuthed(false);
      });
  }, []);

  if (authed === null) return <div className="min-h-screen flex items-center justify-center text-[var(--ink-3)]">Loading…</div>;
  return authed ? <Dashboard onLogout={() => setAuthed(false)} /> : <AdminLogin onAuthed={() => setAuthed(true)} />;
}

function AdminLogin({ onAuthed }: { onAuthed: () => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { token } = await adminApi.login(username.trim(), password);
      adminToken.set(token);
      onAuthed();
    } catch (err) {
      setError((err as Error).message || 'Login failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12 bg-gradient-to-br from-slate-900 via-slate-800 to-teal-900">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <p className="text-[10px] uppercase tracking-widest text-teal-300">Assessment Administration</p>
          <h1 className="text-3xl font-bold text-white mt-1">Results dashboard</h1>
        </div>
        <form onSubmit={submit} className="bg-white rounded-2xl shadow-2xl p-8 border border-slate-200 space-y-4">
          {error && <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}
          <Input label="Username" value={username} onChange={(e) => setUsername(e.target.value)} autoFocus required />
          <div>
            <label htmlFor="admin-pw" className="mb-1 block text-xs font-medium text-[var(--ink-2)]">
              Password
            </label>
            <PasswordInput id="admin-pw" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          <Button type="submit" size="lg" loading={busy} className="w-full">
            Sign in
          </Button>
        </form>
        <p className="text-center text-xs text-white/50 mt-5">
          <Link href="/assessment" className="text-teal-300 hover:underline">
            ← Back to candidate login
          </Link>
        </p>
      </div>
    </div>
  );
}

function Dashboard({ onLogout }: { onLogout: () => void }) {
  const [tab, setTab] = useState<'results' | 'questions'>('results');
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [rows, setRows] = useState<ResultRow[]>([]);
  const [detail, setDetail] = useState<ResultDetail | null>(null);
  const [newCodes, setNewCodes] = useState<{ accessCode: string; label: string | null }[] | null>(null);
  const [count, setCount] = useState('1');
  const [labels, setLabels] = useState('');
  const [creating, setCreating] = useState(false);

  const load = useCallback(() => {
    adminApi.stats().then(setStats).catch(() => {});
    adminApi.results().then(setRows).catch(() => {});
  }, []);
  useEffect(load, [load]);

  const logout = () => {
    adminToken.clear();
    onLogout();
  };

  const generate = async () => {
    setCreating(true);
    try {
      const labelList = labels
        .split(/[\n,]/)
        .map((s) => s.trim())
        .filter(Boolean);
      const payload = labelList.length ? { labels: labelList } : { count: Math.max(1, parseInt(count || '1', 10)) };
      const { created } = await adminApi.createParticipants(payload);
      setNewCodes(created);
      setLabels('');
      setCount('1');
      load();
    } finally {
      setCreating(false);
    }
  };

  const statCards: [string, string | number][] = [
    ['Participants', stats?.participants ?? '—'],
    ['Attempts', stats?.attempts ?? '—'],
    ['Completed', stats?.completed ?? '—'],
    [`Passed (≥${stats?.passMark ?? 50}%)`, stats?.passed ?? '—'],
    ['Avg score', stats ? `${stats.avgScore}%` : '—'],
    ['Active questions', stats?.activeQuestions ?? '—'],
  ];

  return (
    <div className="min-h-screen bg-[var(--canvas)]">
      <header className="border-b border-[var(--line)] bg-[var(--surface)]">
        <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-base font-semibold text-[var(--ink)]">FinData — Assessment admin</h1>
            <p className="text-[11px] text-[var(--ink-3)]">Admin-only. Scores are auto-marked (Part 1 50% · Part 2 50%).</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex overflow-hidden rounded-lg border border-[var(--line)] text-sm">
              {(['results', 'questions'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`px-3 py-1.5 capitalize ${tab === t ? 'bg-teal-600 text-white' : 'text-[var(--ink-2)] hover:bg-[var(--surface-2)]'}`}
                >
                  {t}
                </button>
              ))}
            </div>
            <Button variant="secondary" size="sm" onClick={logout}>
              Sign out
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        {tab === 'questions' ? (
          <QuestionsManager />
        ) : (
        <div className="space-y-6">
        {/* stats */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {statCards.map(([label, val]) => (
            <div key={label} className="rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3">
              <div className="text-[11px] uppercase tracking-wide text-[var(--ink-3)]">{label}</div>
              <div className="text-2xl font-bold text-[var(--ink)] tabular-nums">{val}</div>
            </div>
          ))}
        </div>

        {/* generate codes */}
        <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4">
          <h2 className="text-sm font-semibold text-[var(--ink)] mb-2">Issue access codes</h2>
          <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
            <Input
              label="How many"
              type="number"
              min={1}
              value={count}
              onChange={(e) => setCount(e.target.value)}
              wrapperClassName="w-28"
            />
            <Input
              label="Or names / labels (comma-separated — one code each)"
              value={labels}
              onChange={(e) => setLabels(e.target.value)}
              placeholder="Ada Obi, John Doe"
              wrapperClassName="flex-1"
            />
            <Button onClick={generate} loading={creating}>
              Generate
            </Button>
          </div>
          {newCodes && (
            <div className="mt-3 rounded-lg border border-teal-200 bg-teal-50 p-3">
              <p className="text-xs font-medium text-teal-800 mb-2">New codes — give one to each candidate:</p>
              <div className="flex flex-wrap gap-2">
                {newCodes.map((c) => (
                  <span
                    key={c.accessCode}
                    className="inline-flex items-center gap-1.5 rounded-md bg-white border border-teal-300 px-2.5 py-1 font-mono text-sm text-teal-900"
                  >
                    {c.accessCode}
                    {c.label ? <span className="text-[11px] text-teal-600">· {c.label}</span> : null}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* results table */}
        <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--line)] flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[var(--ink)]">Results ({rows.length})</h2>
            <div className="flex items-center gap-3">
              <button onClick={() => exportResultsCsv(rows)} disabled={!rows.length} className="text-xs text-teal-700 hover:underline disabled:opacity-40">
                Download CSV
              </button>
              <button onClick={load} className="text-xs text-teal-700 hover:underline">
                Refresh
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-[var(--ink-3)] border-b border-[var(--line)]">
                  <th className="px-4 py-2 font-medium">Candidate</th>
                  <th className="px-4 py-2 font-medium">Code</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium text-right">Part 1</th>
                  <th className="px-4 py-2 font-medium text-right">Part 2</th>
                  <th className="px-4 py-2 font-medium text-right">Total</th>
                  <th className="px-4 py-2 font-medium">Result</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-[var(--ink-3)]">
                      No attempts yet. Issue an access code above to get started.
                    </td>
                  </tr>
                )}
                {rows.map((r) => (
                  <tr
                    key={r.attemptId}
                    onClick={() => adminApi.result(r.attemptId).then(setDetail).catch(() => {})}
                    className="border-b border-[var(--line)] last:border-0 hover:bg-[var(--surface-2)] cursor-pointer"
                  >
                    <td className="px-4 py-2.5 text-[var(--ink)]">{r.fullName || r.label || <span className="text-[var(--ink-3)]">—</span>}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-[var(--ink-2)]">{r.accessCode}</td>
                    <td className="px-4 py-2.5">
                      <StatusPill status={r.status} />
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-[var(--ink-2)]">{r.status === 'IN_PROGRESS' ? '—' : r.part1Score}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-[var(--ink-2)]">{r.status === 'IN_PROGRESS' ? '—' : r.part2Score}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-[var(--ink)]">{r.status === 'IN_PROGRESS' ? '—' : `${r.totalScore}%`}</td>
                    <td className="px-4 py-2.5">
                      {r.status === 'IN_PROGRESS' ? (
                        <span className="text-[var(--ink-3)] text-xs">pending</span>
                      ) : r.passed ? (
                        <span className="text-emerald-600 text-xs font-medium">Pass</span>
                      ) : (
                        <span className="text-slate-500 text-xs font-medium">Below</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        </div>
        )}
      </main>

      {detail && <DetailModal detail={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    IN_PROGRESS: 'bg-amber-100 text-amber-700',
    SUBMITTED: 'bg-emerald-100 text-emerald-700',
    EXPIRED: 'bg-slate-100 text-slate-600',
  };
  const label: Record<string, string> = { IN_PROGRESS: 'In progress', SUBMITTED: 'Submitted', EXPIRED: 'Time expired' };
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${map[status] || ''}`}>{label[status] || status}</span>;
}

function DetailModal({ detail, onClose }: { detail: ResultDetail; onClose: () => void }) {
  const fieldLabel = (k: string) => detail.part1Fields.find((f) => f.key === k)?.label || k;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4" onClick={onClose}>
      <div
        className="my-8 w-full max-w-2xl rounded-2xl bg-[var(--surface)] shadow-2xl border border-[var(--line)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--line)] px-5 py-3">
          <div>
            <h3 className="text-sm font-semibold text-[var(--ink)]">{detail.part1.fullName || detail.label || detail.accessCode}</h3>
            <p className="text-[11px] text-[var(--ink-3)] font-mono">{detail.accessCode}</p>
          </div>
          <button onClick={onClose} className="text-[var(--ink-3)] hover:text-[var(--ink)] text-xl leading-none">
            ×
          </button>
        </div>

        <div className="px-5 py-4 space-y-5">
          <div className="grid grid-cols-3 gap-3">
            <Score label="Part 1" value={`${detail.part1Score}/50`} />
            <Score label="Part 2" value={`${detail.part2Score}/50`} />
            <Score label="Total" value={`${detail.totalScore}%`} accent={detail.passed} />
          </div>

          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--ink-3)] mb-2">Part 1 — Personal details</h4>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
              {detail.part1Fields.map((f) => (
                <div key={f.key} className="flex justify-between gap-2 border-b border-[var(--line)] py-1">
                  <dt className="text-[var(--ink-3)]">{fieldLabel(f.key)}</dt>
                  <dd className="text-[var(--ink)] text-right">{detail.part1[f.key] || <span className="text-[var(--ink-3)]">—</span>}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--ink-3)] mb-2">
              Part 2 — {detail.correctCount}/{detail.totalQuestions} correct
            </h4>
            <div className="space-y-2">
              {detail.questions.map((q, i) => (
                <div key={i} className="rounded-lg border border-[var(--line)] p-3">
                  <div className="mb-1 flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-teal-700">
                    <span>{TOPIC_LABEL[q.topic] || q.topic}</span>
                    {q.title ? <span className="text-[var(--ink-3)] normal-case tracking-normal">· {q.title}</span> : null}
                  </div>
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium text-[var(--ink)]">
                      {i + 1}. {q.stem}
                    </p>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                        q.correct ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                      }`}
                    >
                      {q.correct ? 'Correct' : q.chosenIndex == null ? 'No answer' : 'Wrong'}
                    </span>
                  </div>
                  <div className="mt-2 space-y-1">
                    {q.options.map((opt, idx) => {
                      const chosen = q.chosenIndex === idx;
                      const right = q.correctIndex === idx;
                      return (
                        <div
                          key={idx}
                          className={`flex items-center gap-2 rounded px-2 py-1 text-xs ${
                            right
                              ? 'bg-emerald-50 text-emerald-800'
                              : chosen
                                ? 'bg-red-50 text-red-700'
                                : 'text-[var(--ink-2)]'
                          }`}
                        >
                          <span className="w-4">{right ? '✓' : chosen ? '✗' : ''}</span>
                          <span>{opt}</span>
                        </div>
                      );
                    })}
                  </div>
                  {q.competency ? (
                    <p className="mt-2 text-[11px] italic text-[var(--ink-3)]">Competency: {q.competency}</p>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Score({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`rounded-lg border px-3 py-2 ${accent ? 'border-emerald-300 bg-emerald-50' : 'border-[var(--line)] bg-[var(--surface-2)]'}`}>
      <div className="text-[11px] uppercase tracking-wide text-[var(--ink-3)]">{label}</div>
      <div className="text-lg font-bold text-[var(--ink)] tabular-nums">{value}</div>
    </div>
  );
}

function QuestionsManager() {
  const [list, setList] = useState<AdminQuestion[]>([]);
  const [topic, setTopic] = useState<string>('ALL');
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState<AdminQuestion | 'new' | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    adminApi
      .listQuestions()
      .then(setList)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);

  const toggleActive = async (q: AdminQuestion) => {
    setList((l) => l.map((x) => (x.id === q.id ? { ...x, active: !x.active } : x)));
    try {
      await adminApi.setQuestionActive(q.id, !q.active);
    } catch {
      load();
    }
  };

  const filtered = list.filter((q) => (topic === 'ALL' || q.topic === topic) && (showInactive || q.active));
  const activeCount = list.filter((q) => q.active).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4">
        <Select label="Topic" value={topic} onChange={(e) => setTopic(e.target.value)} wrapperClassName="w-56">
          <option value="ALL">All topics</option>
          {TOPICS.map((t) => (
            <option key={t} value={t}>
              {TOPIC_LABEL[t] || t}
            </option>
          ))}
        </Select>
        <label className="flex items-center gap-2 pb-2 text-sm text-[var(--ink-2)]">
          <input type="checkbox" className="accent-teal-600" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
          Show retired
        </label>
        <div className="flex-1" />
        <span className="pb-2 text-xs text-[var(--ink-3)]">
          {activeCount} active · {list.length} total
        </span>
        <Button onClick={() => setEditing('new')}>+ Add question</Button>
      </div>

      <div className="overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface)]">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--line)] text-left text-[11px] uppercase tracking-wide text-[var(--ink-3)]">
                <th className="px-4 py-2 font-medium">Topic</th>
                <th className="px-4 py-2 font-medium">Question</th>
                <th className="px-4 py-2 font-medium">Correct answer</th>
                <th className="px-4 py-2 font-medium">Active</th>
                <th className="px-4 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-[var(--ink-3)]">
                    Loading…
                  </td>
                </tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-[var(--ink-3)]">
                    No questions match.
                  </td>
                </tr>
              )}
              {filtered.map((q) => (
                <tr key={q.id} className={`border-b border-[var(--line)] last:border-0 ${q.active ? '' : 'opacity-55'}`}>
                  <td className="px-4 py-2.5 whitespace-nowrap text-[11px] font-medium uppercase tracking-wide text-teal-700">
                    {TOPIC_LABEL[q.topic] || q.topic}
                  </td>
                  <td className="px-4 py-2.5 text-[var(--ink)]">
                    <span className="line-clamp-2">{q.stem}</span>
                  </td>
                  <td className="px-4 py-2.5 text-[var(--ink-2)]">
                    <span className="line-clamp-2">{q.options[q.correctIndex]}</span>
                  </td>
                  <td className="px-4 py-2.5">
                    <button
                      onClick={() => toggleActive(q)}
                      className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${q.active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}
                    >
                      {q.active ? 'Active' : 'Retired'}
                    </button>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <button onClick={() => setEditing(q)} className="text-xs text-teal-700 hover:underline">
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {editing && (
        <QuestionEditor
          initial={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function QuestionEditor({
  initial,
  onClose,
  onSaved,
}: {
  initial: AdminQuestion | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [topic, setTopic] = useState(initial?.topic || 'EXCEL');
  const [title, setTitle] = useState(initial?.title || '');
  const [stem, setStem] = useState(initial?.stem || '');
  const [options, setOptions] = useState<string[]>(initial?.options?.slice(0, 4) || ['', '', '', '']);
  const [correctIndex, setCorrectIndex] = useState(initial?.correctIndex ?? 0);
  const [competency, setCompetency] = useState(initial?.competency || '');
  const [isCaseStudy, setIsCaseStudy] = useState(!!initial?.isCaseStudy);
  const [active, setActive] = useState(initial?.active ?? true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setOpt = (i: number, v: string) => setOptions((o) => o.map((x, k) => (k === i ? v : x)));

  const save = async () => {
    setError(null);
    if (!stem.trim()) return setError('Enter the question text.');
    if (options.some((o) => !o.trim())) return setError('Fill in all four options.');
    setBusy(true);
    const payload: QuestionInput = { topic, title: title.trim(), stem: stem.trim(), options: options.map((o) => o.trim()), correctIndex, competency: competency.trim(), isCaseStudy, active };
    try {
      if (initial) await adminApi.updateQuestion(initial.id, payload);
      else await adminApi.createQuestion(payload);
      onSaved();
    } catch (e) {
      setError((e as Error).message || 'Could not save');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4" onClick={onClose}>
      <div className="my-8 w-full max-w-2xl rounded-2xl border border-[var(--line)] bg-[var(--surface)] shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-[var(--line)] px-5 py-3">
          <h3 className="text-sm font-semibold text-[var(--ink)]">{initial ? 'Edit question' : 'Add question'}</h3>
          <button onClick={onClose} className="text-xl leading-none text-[var(--ink-3)] hover:text-[var(--ink)]">
            ×
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Select label="Topic" value={topic} onChange={(e) => setTopic(e.target.value)}>
              {TOPICS.map((t) => (
                <option key={t} value={t}>
                  {TOPIC_LABEL[t] || t}
                </option>
              ))}
            </Select>
            <Input label="Title (short)" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Spreadsheet Calculation" />
          </div>
          <Textarea label="Question" value={stem} onChange={(e) => setStem(e.target.value)} rows={2} required />

          <div>
            <p className="mb-1 text-xs font-medium text-[var(--ink-2)]">Options — select the correct one</p>
            <div className="space-y-2">
              {options.map((opt, i) => (
                <label key={i} className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 ${correctIndex === i ? 'border-teal-500 bg-teal-50' : 'border-[var(--line)]'}`}>
                  <input type="radio" name="correct" className="accent-teal-600" checked={correctIndex === i} onChange={() => setCorrectIndex(i)} />
                  <span className="w-4 text-xs text-[var(--ink-3)]">{String.fromCharCode(65 + i)}</span>
                  <input
                    value={opt}
                    onChange={(e) => setOpt(i, e.target.value)}
                    placeholder={`Option ${String.fromCharCode(65 + i)}`}
                    className="flex-1 bg-transparent text-sm text-[var(--ink)] outline-none"
                  />
                </label>
              ))}
            </div>
          </div>

          <Input label="Competency assessed (optional)" value={competency} onChange={(e) => setCompetency(e.target.value)} />
          <div className="flex items-center gap-5 text-sm text-[var(--ink-2)]">
            <label className="flex items-center gap-2">
              <input type="checkbox" className="accent-teal-600" checked={isCaseStudy} onChange={(e) => setIsCaseStudy(e.target.checked)} />
              Case study
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" className="accent-teal-600" checked={active} onChange={(e) => setActive(e.target.checked)} />
              Active (in the test pool)
            </label>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-[var(--line)] px-5 py-3">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} loading={busy}>
            {initial ? 'Save changes' : 'Add question'}
          </Button>
        </div>
      </div>
    </div>
  );
}
