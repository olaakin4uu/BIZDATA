'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/Button';
import { Input, Select } from '@/components/Field';
import { candidateApi, candToken, mmss, TOPIC_LABEL, type ExamState } from '../lib';

export default function ExamPage() {
  const router = useRouter();
  const [phase, setPhase] = useState<'loading' | 'exam' | 'result'>('loading');
  const [state, setState] = useState<ExamState | null>(null);
  const [part1, setPart1] = useState<Record<string, string>>({});
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [remaining, setRemaining] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const deadlineRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const submittedRef = useRef(false);
  const part1Ref = useRef(part1);
  part1Ref.current = part1;

  const finishFromServer = useCallback(async () => {
    submittedRef.current = true;
    if (timerRef.current) clearInterval(timerRef.current);
    try {
      const s = await candidateApi.state();
      setState(s);
      setPhase('result');
    } catch {
      /* leave as-is */
    }
  }, []);

  const onError = useCallback(
    (err: unknown) => {
      // 403 → the server closed the sitting (time elapsed). Show the result.
      if ((err as { status?: number })?.status === 403) finishFromServer();
    },
    [finishFromServer],
  );

  const doSubmit = useCallback(async () => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    if (timerRef.current) clearInterval(timerRef.current);
    setSubmitting(true);
    try {
      try {
        await candidateApi.savePart1(part1Ref.current);
      } catch {
        /* best-effort flush */
      }
      const final = await candidateApi.submit();
      setState(final);
      setPhase('result');
    } catch {
      try {
        const s = await candidateApi.state();
        setState(s);
        setPhase('result');
      } catch {
        /* ignore */
      }
    } finally {
      setSubmitting(false);
    }
  }, []);

  // Load the attempt (or bounce to login).
  useEffect(() => {
    if (!candToken.get()) {
      router.replace('/assessment');
      return;
    }
    candidateApi
      .state()
      .then((s) => {
        setState(s);
        if (s.status !== 'IN_PROGRESS') {
          setPhase('result');
          return;
        }
        setPart1(s.part1 || {});
        const a: Record<string, number> = {};
        s.questions.forEach((q) => {
          if (q.chosenIndex != null) a[q.questionId] = q.chosenIndex;
        });
        setAnswers(a);
        deadlineRef.current = Date.now() + s.remainingMs;
        setPhase('exam');
      })
      .catch(() => {
        candToken.clear();
        router.replace('/assessment');
      });
  }, [router]);

  // Countdown — anchored to a fixed deadline so tab throttling can't slow it.
  useEffect(() => {
    if (phase !== 'exam') return;
    const tick = () => {
      const r = deadlineRef.current - Date.now();
      setRemaining(r);
      if (r <= 0) {
        if (timerRef.current) clearInterval(timerRef.current);
        doSubmit();
      }
    };
    tick();
    timerRef.current = setInterval(tick, 500);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [phase, doSubmit]);

  const setField = (k: string, v: string) => setPart1((p) => ({ ...p, [k]: v }));
  const saveField = () => candidateApi.savePart1(part1Ref.current).catch(onError);
  const choose = (qid: string, idx: number) => {
    setAnswers((a) => ({ ...a, [qid]: idx }));
    candidateApi.saveAnswer(qid, idx).catch(onError);
  };

  const finish = () => {
    candToken.clear();
    router.replace('/assessment');
  };

  if (phase === 'loading') {
    return <div className="min-h-screen flex items-center justify-center text-[var(--ink-3)]">Loading…</div>;
  }

  if (phase === 'result') {
    const r = state?.result;
    return (
      <div className="min-h-screen flex items-center justify-center px-4 py-12 bg-gradient-to-br from-slate-900 via-slate-800 to-teal-900">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-8 border border-slate-200 text-center">
          <div
            className={`mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full ${
              r?.passed ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'
            }`}
          >
            <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
            </svg>
          </div>
          <h1 className="text-lg font-semibold text-slate-800">
            {state?.status === 'EXPIRED' ? 'Time’s up — test submitted' : 'Test submitted'}
          </h1>
          <p className="text-xs text-slate-500 mt-1">Thank you. Your responses have been recorded.</p>

          {r && (
            <>
              <div className="mt-6 text-5xl font-bold text-slate-900 tabular-nums">{r.totalScore}%</div>
              <div className="mt-1 text-xs font-medium uppercase tracking-wide text-slate-400">Total score</div>
              <div className="mt-5 grid grid-cols-2 gap-3 text-left">
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <div className="text-[11px] uppercase tracking-wide text-slate-400">Part 1 · Details</div>
                  <div className="text-lg font-semibold text-slate-800 tabular-nums">{r.part1Score}<span className="text-xs text-slate-400"> / 50</span></div>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <div className="text-[11px] uppercase tracking-wide text-slate-400">Part 2 · Questions</div>
                  <div className="text-lg font-semibold text-slate-800 tabular-nums">{r.part2Score}<span className="text-xs text-slate-400"> / 50</span></div>
                </div>
              </div>
            </>
          )}

          <Button size="lg" className="w-full mt-7" onClick={finish}>
            Finish
          </Button>
        </div>
      </div>
    );
  }

  // ── exam ───────────────────────────────────────────────────────────────────
  const low = remaining <= 60_000;
  return (
    <div className="min-h-screen bg-[var(--canvas)] pb-28">
      {/* sticky countdown header */}
      <header className="sticky top-0 z-10 border-b border-[var(--line)] bg-[var(--surface)]/95 backdrop-blur">
        <div className="mx-auto max-w-3xl px-4 py-3 flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-[var(--ink)]">FinData Aptitude Test</div>
            <div className="text-[11px] text-[var(--ink-3)]">Answer all sections before time runs out.</div>
          </div>
          <div
            className={`rounded-lg px-3 py-1.5 font-mono text-lg font-bold tabular-nums ${
              low ? 'bg-red-100 text-red-700 animate-pulse' : 'bg-teal-50 text-teal-800'
            }`}
            aria-live="polite"
          >
            {mmss(remaining)}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4">
        {/* Part 1 */}
        <section className="mt-6">
          <div className="flex items-baseline gap-2">
            <h2 className="text-base font-semibold text-[var(--ink)]">Part 1 — Personal details</h2>
            <span className="text-xs text-[var(--ink-3)]">Worth 50%</span>
          </div>
          <p className="text-xs text-[var(--ink-3)] mt-0.5 mb-3">Complete every field, correctly formatted, for full marks.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4">
            {state?.part1Fields.map((f) =>
              f.type === 'select' ? (
                <Select
                  key={f.key}
                  label={f.label}
                  value={part1[f.key] || ''}
                  onChange={(e) => setField(f.key, e.target.value)}
                  onBlur={saveField}
                >
                  <option value="">Select…</option>
                  {(f.options || []).map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </Select>
              ) : (
                <Input
                  key={f.key}
                  label={f.label}
                  type={f.type}
                  value={part1[f.key] || ''}
                  onChange={(e) => setField(f.key, e.target.value)}
                  onBlur={saveField}
                />
              ),
            )}
          </div>
        </section>

        {/* Part 2 */}
        <section className="mt-8">
          <div className="flex items-baseline gap-2">
            <h2 className="text-base font-semibold text-[var(--ink)]">Part 2 — Questions</h2>
            <span className="text-xs text-[var(--ink-3)]">Worth 50% · {state?.questions.length} questions</span>
          </div>
          <p className="text-xs text-[var(--ink-3)] mt-0.5 mb-3">Choose the best answer for each.</p>
          <div className="space-y-4">
            {state?.questions.map((q, i) => (
              <div key={q.questionId} className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-teal-600 text-xs font-bold text-white">
                    {i + 1}
                  </span>
                  <span className="text-[11px] font-medium uppercase tracking-wide text-teal-700">
                    {TOPIC_LABEL[q.topic] || q.topic}
                    {q.isCaseStudy ? ' · Case study' : ''}
                  </span>
                </div>
                <p className="text-sm font-medium text-[var(--ink)] mb-3">{q.stem}</p>
                <div className="space-y-2">
                  {q.options.map((opt, idx) => {
                    const selected = answers[q.questionId] === idx;
                    return (
                      <label
                        key={idx}
                        className={`flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2 text-sm transition-colors ${
                          selected
                            ? 'border-teal-500 bg-teal-50 text-teal-900'
                            : 'border-[var(--line)] hover:bg-[var(--surface-2)] text-[var(--ink)]'
                        }`}
                      >
                        <input
                          type="radio"
                          name={q.questionId}
                          className="mt-0.5 accent-teal-600"
                          checked={selected}
                          onChange={() => choose(q.questionId, idx)}
                        />
                        <span>{opt}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>

      {/* submit bar */}
      <div className="fixed bottom-0 inset-x-0 border-t border-[var(--line)] bg-[var(--surface)]/95 backdrop-blur">
        <div className="mx-auto max-w-3xl px-4 py-3 flex items-center justify-between">
          <span className="text-xs text-[var(--ink-3)]">
            {Object.keys(answers).length}/{state?.questions.length} answered
          </span>
          <Button size="lg" loading={submitting} onClick={doSubmit}>
            Submit test
          </Button>
        </div>
      </div>
    </div>
  );
}
