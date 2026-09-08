'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/Button';
import { Input, Select } from '@/components/Field';
import { Modal } from '@/components/Modal';
import { candidateApi, candToken, mmss, TOPIC_LABEL, type ExamState } from '../lib';

export default function ExamPage() {
  const router = useRouter();
  const [phase, setPhase] = useState<'loading' | 'exam' | 'result'>('loading');
  const [state, setState] = useState<ExamState | null>(null);
  const [part1, setPart1] = useState<Record<string, string>>({});
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [remaining, setRemaining] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  // Two steps rather than one long scroll, and deliberately NOT one question per
  // page. The sitting is five minutes for seven fields and ten questions - about
  // thirty seconds a question - so nine extra page transitions would spend the
  // scarcest thing in the test. Paging also hides what is coming: a candidate
  // could run out of time on question four having never seen five to ten, which
  // turns a time-management problem into an invisible one. Splitting the two
  // PARTS costs one transition and matches how the paper is actually scored.
  const [step, setStep] = useState<'details' | 'questions'>('details');

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

  const goToQuestions = () => {
    // Flush the last field first: saveField only fires on blur, and clicking
    // Continue does not always blur the control that still has focus.
    saveField();
    setStep('questions');
    window.scrollTo({ top: 0 });
  };

  const finish = () => {
    candToken.clear();
    router.replace('/assessment');
  };

  if (phase === 'loading') {
    return <div className="min-h-screen flex items-center justify-center text-[var(--ink-3)]">Loading…</div>;
  }

  if (phase === 'result') {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 py-12 bg-gradient-to-br from-slate-900 via-slate-800 to-teal-900">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-8 border border-slate-200 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-teal-100 text-teal-700">
            <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
            </svg>
          </div>
          <h1 className="text-lg font-semibold text-slate-800">
            {state?.status === 'EXPIRED' ? 'Time’s up — test submitted' : 'Test submitted'}
          </h1>
          <p className="text-sm text-slate-500 mt-2">
            Thank you. Your responses have been recorded and will be reviewed by the administrator.
          </p>
          <Button size="lg" className="w-full mt-7" onClick={finish}>
            Finish
          </Button>
        </div>
      </div>
    );
  }

  // ── exam ───────────────────────────────────────────────────────────────────
  const low = remaining <= 60_000;
  // Rendered rather than hardcoded so the copy stays true if EXAM_DURATION_MS moves.
  const totalMin = Math.max(1, Math.round((state?.durationMs ?? 0) / 60_000));

  // What is still outstanding, for the pre-submit check.
  // NOTE: this can only detect an EMPTY field, never a badly formatted one. The
  // validators live in PART1_FIELDS on the server and publicPart1Fields() strips
  // them deliberately, so the dialog says "not filled in" and never claims a form
  // is correct - promising that and then scoring it lower would be worse than
  // saying nothing.
  const p1Fields = state?.part1Fields ?? [];
  const emptyCount = p1Fields.filter((f) => !(part1[f.key] ?? '').trim()).length;
  const unanswered = Math.max(0, (state?.questions.length ?? 0) - Object.keys(answers).length);
  const nothingOutstanding = emptyCount === 0 && unanswered === 0;
  // Part 1 is completion-scored and worth 50, so empty fields have a knowable price.
  const marksAtRisk = p1Fields.length ? Math.round((emptyCount / p1Fields.length) * 50) : 0;
  return (
    <div className="min-h-screen bg-[var(--canvas)] pb-28">
      {/* sticky countdown header */}
      <header className="sticky top-0 z-10 border-b border-[var(--line)] bg-[var(--surface)]/95 backdrop-blur">
        <div className="mx-auto max-w-3xl px-4 py-3 flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-[var(--ink)]">FinData Aptitude Test</div>
            <div className="text-[11px] text-[var(--ink-3)]">
              {totalMin} minutes · answers save as you go · submits automatically at zero
            </div>
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
        {step === 'details' && (
          <>
        {/* Briefing. The old line ("Answer all sections before time runs out") told
            candidates to hurry without answering what they actually worry about:
            whether work is being saved, what happens at zero, and where the marks
            are. Part 1 is scored on completion alone, so a candidate who rushes
            past it to reach the questions throws away up to half the total for
            nothing - that is the point worth making loudest. */}
        <section className="mt-6 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4">
          <h2 className="text-sm font-semibold text-[var(--ink)]">Before you start</h2>
          <ul className="mt-2 space-y-1.5 text-xs text-[var(--ink-3)]">
            <li>
              <span className="font-medium text-[var(--ink)]">Time.</span> {totalMin} minutes in total, timed
              by the server. The clock keeps running if you close the tab, and it cannot be paused or restarted.
            </li>
            <li>
              <span className="font-medium text-[var(--ink)]">Your work is saved as you go.</span> Every field
              and every answer is stored the moment you complete it, so reloading the page will not lose anything.
            </li>
            <li>
              <span className="font-medium text-[var(--ink)]">At zero the test submits itself</span> with whatever
              you have entered. Nothing you have already answered is discarded.
            </li>
            <li>
              <span className="font-medium text-[var(--ink)]">Both parts are worth 50%.</span> Part 1 is marked on
              completion alone - every field filled in the right format earns its share, so a complete form scores
              the full 50 without a single question answered. Part 2 is {state?.questions.length ?? 0}{' '}
              multiple-choice questions.
            </li>
            <li>
              <span className="font-medium text-[var(--ink)]">Suggested approach.</span> Complete Part 1 first -
              it is quick and guaranteed - then spend what is left on the questions.
            </li>
          </ul>
        </section>

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
          </>
        )}

        {step === 'questions' && (
        <section className="mt-8">
          <div className="flex items-baseline gap-2">
            <h2 className="text-base font-semibold text-[var(--ink)]">Part 2 — Questions</h2>
            <span className="text-xs text-[var(--ink-3)]">Worth 50% · {state?.questions.length} questions</span>
          </div>
          <p className="text-xs text-[var(--ink-3)] mt-0.5 mb-3">Choose the best answer for each.</p>
          {/* Jump-to strip. This is what makes paging unnecessary: it gives the
              navigation a paged layout would provide while keeping the thing a
              paged layout takes away - seeing at a glance which questions are
              still outstanding, so the easy ones can be banked first. */}
          <div className="sticky top-[57px] z-10 -mx-4 mb-3 border-y border-[var(--line)] bg-[var(--surface)]/95 px-4 py-2 backdrop-blur">
            <div className="flex flex-wrap gap-1.5">
              {state?.questions.map((q, i) => {
                const done = answers[q.questionId] != null;
                return (
                  <button
                    key={q.questionId}
                    type="button"
                    onClick={() => document.getElementById(`q-${i}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                    aria-label={`Go to question ${i + 1}${done ? ', answered' : ', not answered'}`}
                    className={`h-7 w-7 rounded-full text-xs font-semibold transition-colors ${
                      done
                        ? 'bg-teal-600 text-white'
                        : 'border border-[var(--line)] bg-[var(--surface)] text-[var(--ink-3)] hover:bg-[var(--surface-2)]'
                    }`}
                  >
                    {i + 1}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="space-y-4">
            {state?.questions.map((q, i) => (
              <div key={q.questionId} id={`q-${i}`} className="scroll-mt-32 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4">
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
        )}
      </main>

      {/* submit bar */}
      <div className="fixed bottom-0 inset-x-0 border-t border-[var(--line)] bg-[var(--surface)]/95 backdrop-blur">
        <div className="mx-auto max-w-3xl px-4 py-3 flex items-center justify-between gap-3">
          {step === 'details' ? (
            <>
              <span className="text-xs text-[var(--ink-3)]">
                {p1Fields.length - emptyCount}/{p1Fields.length} details completed
              </span>
              <Button size="lg" onClick={goToQuestions}>
                Continue to questions
              </Button>
            </>
          ) : (
            <>
              {/* Going back must stay possible: Part 1 is half the marks, and a
                  candidate who spots a blank field should not have to abandon it. */}
              <button
                type="button"
                onClick={() => { setStep('details'); window.scrollTo({ top: 0 }); }}
                className="text-xs font-medium text-[var(--ink-3)] underline underline-offset-2 hover:text-[var(--ink)]"
              >
                Back to details{emptyCount > 0 ? ` (${emptyCount} blank)` : ''}
              </button>
              <span className="text-xs text-[var(--ink-3)]">
                {Object.keys(answers).length}/{state?.questions.length} answered
              </span>
              <Button size="lg" loading={submitting} onClick={() => setConfirmOpen(true)}>
                Submit test
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Pre-submit check. Deliberately gates ONLY the button: the countdown calls
          doSubmit() directly, so expiry still submits silently. Putting the dialog
          in front of doSubmit() itself would leave the automatic submission waiting
          on a click nobody is there to make, turning a safe auto-submit into a lost
          paper. It confirms rather than blocks - finishing early is a legitimate
          choice on a five-minute sitting. */}
      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title={nothingOutstanding ? 'Submit your test?' : 'You have not finished'}
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button
              variant={nothingOutstanding ? 'secondary' : 'primary'}
              onClick={() => setConfirmOpen(false)}
            >
              {nothingOutstanding ? 'Keep checking' : 'Go back'}
            </Button>
            <Button
              variant={nothingOutstanding ? 'primary' : 'secondary'}
              loading={submitting}
              onClick={() => {
                setConfirmOpen(false);
                doSubmit();
              }}
            >
              {nothingOutstanding ? 'Submit now' : 'Submit anyway'}
            </Button>
          </div>
        }
      >
        {nothingOutstanding ? (
          <p className="text-sm text-[var(--ink-2)]">
            You have completed every field and answered every question. There is still{' '}
            <span className="font-semibold text-[var(--ink)]">{mmss(remaining)}</span> on the clock — you can
            keep checking your work, or submit now. Submitting is final.
          </p>
        ) : (
          <div className="space-y-3 text-sm text-[var(--ink-2)]">
            <ul className="space-y-1">
              {emptyCount > 0 && (
                <li>
                  <span className="font-semibold text-[var(--ink)]">
                    {emptyCount} of {p1Fields.length} personal details
                  </span>{' '}
                  are not filled in.
                </li>
              )}
              {unanswered > 0 && (
                <li>
                  <span className="font-semibold text-[var(--ink)]">
                    {unanswered} of {state?.questions.length} questions
                  </span>{' '}
                  are unanswered.
                </li>
              )}
            </ul>
            {emptyCount > 0 && (
              <p>
                Part 1 is marked on completion, so those fields are worth about{' '}
                <span className="font-semibold text-[var(--ink)]">{marksAtRisk} of its 50 points</span> — usually
                a few seconds each.
              </p>
            )}
            <p>
              You still have <span className="font-semibold text-[var(--ink)]">{mmss(remaining)}</span> left.
              Submitting now is final and cannot be undone.
            </p>
          </div>
        )}
      </Modal>
    </div>
  );
}
