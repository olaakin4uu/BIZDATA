'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import PageHeader from '@/components/PageHeader';
import Markdown from '@/components/Markdown';
import {
  irisApi,
  chatStream,
  downloadIrisExport,
  type IrisCard,
  type IrisConversationSummary,
} from '@/lib/api/iris';
import { extractErrorMessage } from '@/lib/utils';

type Item =
  | { kind: 'text'; role: 'user' | 'assistant'; text: string; thinking?: string }
  | {
      kind: 'card';
      card: IrisCard;
      state: 'pending' | 'confirmed' | 'cancelled' | 'working';
      result?: string;
      download?: { exportId: string; fileName: string };
    };

const SUGGESTIONS = [
  'Show me the top 10 cases for 2025',
  'Explain the highest-confidence case',
  'Generate an Excel report of open cases',
  'Run the 2025 scan',
];

const TOOL_LABEL: Record<string, string> = {
  list_cases: 'Searching cases…',
  explain_case: 'Reading the case…',
  taxpayer_summary: 'Profiling the taxpayer…',
  scan_results: 'Checking scan results…',
  run_scan: 'Preparing the scan…',
  generate_report: 'Preparing the report…',
  draft_notice: 'Drafting the notice…',
};

export default function IrisPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [conversationId, setConversationId] = useState<string | undefined>(undefined);
  const [conversations, setConversations] = useState<IrisConversationSummary[]>([]);
  const [toolStatus, setToolStatus] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const stickBottom = useRef(true);

  const refreshConversations = useCallback(() => {
    irisApi.listConversations().then(setConversations).catch(() => {});
  }, []);

  useEffect(() => refreshConversations(), [refreshConversations]);

  // Scroll etiquette: only auto-scroll when the user is already near the bottom.
  useEffect(() => {
    if (stickBottom.current) scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [items, loading, toolStatus]);

  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    stickBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }

  // Auto-grow composer.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [input]);

  function patchLastAssistant(fn: (it: Extract<Item, { kind: 'text' }>) => Extract<Item, { kind: 'text' }>) {
    setItems((prev) => {
      const next = [...prev];
      const last = next[next.length - 1];
      if (last && last.kind === 'text' && last.role === 'assistant') next[next.length - 1] = fn(last);
      return next;
    });
  }

  async function send(message: string) {
    const text = message.trim();
    if (!text || loading) return;
    setError('');
    setInput('');
    setToolStatus(null);
    stickBottom.current = true;
    setItems((prev) => [...prev, { kind: 'text', role: 'user', text }, { kind: 'text', role: 'assistant', text: '', thinking: '' }]);
    setLoading(true);
    inputRef.current?.focus();

    const controller = new AbortController();
    abortRef.current = controller;
    await chatStream(
      text,
      conversationId,
      {
        onThinking: (t) => patchLastAssistant((it) => ({ ...it, thinking: (it.thinking ?? '') + t })),
        onTool: (name) => setToolStatus(TOOL_LABEL[name] ?? 'Working…'),
        onDelta: (t) => {
          setToolStatus(null);
          patchLastAssistant((it) => ({ ...it, text: it.text + t }));
        },
        onError: (m) => {
          setError(m);
          finish(true);
        },
        onStopped: () => finish(false),
        onDone: ({ conversationId: cid, reply, cards }) => {
          setConversationId(cid);
          setItems((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last && last.kind === 'text' && last.role === 'assistant') {
              if (reply) next[next.length - 1] = { ...last, text: reply };
              else if (!last.thinking) next.pop();
            }
            for (const card of cards) next.push({ kind: 'card', card, state: 'pending' });
            return next;
          });
          finish(false);
          refreshConversations();
        },
      },
      controller.signal,
    );
  }

  function finish(dropEmpty: boolean) {
    setLoading(false);
    setToolStatus(null);
    abortRef.current = null;
    if (dropEmpty) {
      setItems((prev) => {
        const last = prev[prev.length - 1];
        return last && last.kind === 'text' && last.role === 'assistant' && !last.text && !last.thinking ? prev.slice(0, -1) : prev;
      });
    }
  }

  function stop() {
    abortRef.current?.abort();
  }

  function updateCard(draftId: string, patch: Partial<Extract<Item, { kind: 'card' }>>) {
    setItems((prev) => prev.map((it) => (it.kind === 'card' && it.card.draftId === draftId ? { ...it, ...patch } : it)));
  }

  async function confirmCard(card: IrisCard) {
    updateCard(card.draftId, { state: 'working' });
    try {
      const res = await irisApi.confirm(card.draftId);
      updateCard(card.draftId, { state: 'confirmed', result: res.message, download: res.download });
    } catch (e) {
      updateCard(card.draftId, { state: 'pending' });
      setError(extractErrorMessage(e));
    }
  }

  async function cancelCard(card: IrisCard) {
    updateCard(card.draftId, { state: 'working' });
    try {
      await irisApi.cancel(card.draftId);
      updateCard(card.draftId, { state: 'cancelled' });
    } catch (e) {
      updateCard(card.draftId, { state: 'pending' });
      setError(extractErrorMessage(e));
    }
  }

  function newChat() {
    setItems([]);
    setConversationId(undefined);
    setError('');
    inputRef.current?.focus();
  }

  async function loadConversation(id: string) {
    setDrawerOpen(false);
    try {
      const c = await irisApi.getConversation(id);
      setConversationId(c.conversationId);
      setItems(c.messages.map((m) => ({ kind: 'text', role: m.role as 'user' | 'assistant', text: m.text })));
      setError('');
    } catch (e) {
      setError(extractErrorMessage(e));
    }
  }

  const convoList = (
    <ul className="space-y-0.5">
      {conversations.length === 0 && <li className="px-2 py-3 text-xs text-slate-500">No conversations yet.</li>}
      {conversations.map((c) => (
        <li key={c.id}>
          <button
            onClick={() => loadConversation(c.id)}
            className={`w-full truncate rounded-lg px-2.5 py-2 text-left text-xs transition-colors ${
              c.id === conversationId ? 'bg-teal-50 font-medium text-teal-800' : 'text-[var(--ink-2)] hover:bg-slate-50'
            }`}
            title={c.title ?? 'Conversation'}
          >
            {c.title ?? 'Conversation'}
          </button>
        </li>
      ))}
    </ul>
  );

  return (
    <div>
      <PageHeader
        title="IRIS"
        icon="robot"
        subtitle="Your revenue-intelligence assistant. It reasons before answering, cites the data, and asks you to confirm anything sensitive — running a scan, exporting a report, or issuing a §35 notice."
        actions={
          <div className="flex gap-2">
            <button
              onClick={() => setDrawerOpen(true)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-[var(--ink-2)] hover:bg-slate-50 md:hidden"
            >
              History
            </button>
            <button onClick={newChat} className="rounded-lg bg-teal-600 px-3.5 py-1.5 text-sm font-medium text-white hover:bg-teal-700">
              New chat
            </button>
          </div>
        }
      />

      <div className="flex h-[calc(100dvh-11rem)] gap-4">
        <aside className="hidden w-56 shrink-0 flex-col rounded-xl border border-slate-200 bg-white md:flex">
          <p className="border-b border-slate-100 px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Conversations</p>
          <nav aria-label="Conversation history" className="flex-1 overflow-y-auto p-2">
            {convoList}
          </nav>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <div
            ref={scrollRef}
            onScroll={onScroll}
            role="log"
            aria-live="polite"
            aria-label="Conversation with IRIS"
            className="flex-1 overflow-y-auto rounded-xl border border-slate-200 bg-gradient-to-b from-slate-50/80 to-white p-4"
          >
            <div className="mx-auto max-w-3xl space-y-4">
              {items.length === 0 && (
                <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center">
                  <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-600 text-xl font-semibold text-white shadow-sm">IR</span>
                  <p className="max-w-md text-sm text-[var(--ink-2)]">
                    Hello — I&apos;m IRIS. I reason over what the detection engine and the data actually show, present it clearly, and
                    ask you to confirm anything that changes a case, sends a notice, or exports data.
                  </p>
                  <div className="flex flex-wrap justify-center gap-2">
                    {SUGGESTIONS.map((s) => (
                      <button
                        key={s}
                        onClick={() => send(s)}
                        className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-[var(--ink-2)] transition-colors hover:border-teal-300 hover:text-teal-700"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {items.map((it, i) =>
                it.kind === 'text' ? (
                  it.role === 'user' ? (
                    <div key={i} className="flex justify-end">
                      <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-tr-sm bg-teal-600 px-4 py-2.5 text-sm leading-relaxed text-white">
                        {it.text}
                      </div>
                    </div>
                  ) : (
                    <AssistantBubble
                      key={i}
                      text={it.text}
                      thinking={it.thinking}
                      streaming={loading && i === items.length - 1}
                      toolStatus={loading && i === items.length - 1 ? toolStatus : null}
                    />
                  )
                ) : (
                  <div key={i} className="pl-9">
                    <ConfirmCard
                      item={it}
                      onConfirm={() => confirmCard(it.card)}
                      onCancel={() => cancelCard(it.card)}
                      onDownload={() => it.download && downloadIrisExport(it.download.exportId, it.download.fileName)}
                    />
                  </div>
                ),
              )}
            </div>
          </div>

          {error && (
            <p role="alert" className="mt-2 text-sm text-red-600">
              {error}
            </p>
          )}

          <form
            className="mx-auto mt-3 flex w-full max-w-3xl items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
          >
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              aria-label="Message IRIS"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
              rows={1}
              placeholder="Ask IRIS…"
              className="max-h-40 flex-1 resize-none rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-[var(--ink)] outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
            />
            {loading ? (
              <button
                type="button"
                onClick={stop}
                className="rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-medium text-[var(--ink-2)] hover:bg-slate-50"
              >
                Stop
              </button>
            ) : (
              <button
                type="submit"
                disabled={!input.trim()}
                className="rounded-xl bg-teal-600 px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-teal-700 disabled:opacity-50"
              >
                Send
              </button>
            )}
          </form>
        </div>
      </div>

      {/* Mobile history drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/30" onClick={() => setDrawerOpen(false)} />
          <div className="absolute left-0 top-0 flex h-full w-72 flex-col bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <span className="text-sm font-semibold text-[var(--ink)]">Conversations</span>
              <button onClick={() => setDrawerOpen(false)} aria-label="Close history" className="text-slate-500 hover:text-slate-700">
                ✕
              </button>
            </div>
            <button
              onClick={() => {
                newChat();
                setDrawerOpen(false);
              }}
              className="m-2 rounded-lg bg-teal-600 px-3 py-2 text-sm font-medium text-white hover:bg-teal-700"
            >
              + New chat
            </button>
            <nav aria-label="Conversation history" className="flex-1 overflow-y-auto p-2">
              {convoList}
            </nav>
          </div>
        </div>
      )}
    </div>
  );
}

function AssistantBubble({
  text,
  thinking,
  streaming,
  toolStatus,
}: {
  text: string;
  thinking?: string;
  streaming: boolean;
  toolStatus: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const hasThinking = !!thinking && thinking.trim().length > 0;
  const autoShow = streaming && !text;
  const show = open || autoShow;

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked */
    }
  }

  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-teal-600 text-[11px] font-bold text-white">IR</span>
      <div className="group relative min-w-0 max-w-[85%] rounded-2xl rounded-tl-sm border border-slate-200 bg-white px-4 py-3 shadow-sm">
        {hasThinking && (
          <div className="mb-2">
            <button
              onClick={() => setOpen((o) => !o)}
              aria-expanded={show}
              className="flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-700"
            >
              <span aria-hidden>{show ? '▾' : '▸'}</span>
              {autoShow ? 'Thinking…' : 'Reasoning'}
            </button>
            {show && (
              <div className="mt-1.5 whitespace-pre-wrap border-l-2 border-slate-200 pl-3 text-xs leading-relaxed text-slate-500">{thinking}</div>
            )}
          </div>
        )}

        {toolStatus && (
          <p className="mb-1 flex items-center gap-1.5 text-xs text-slate-500">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-teal-500 motion-reduce:animate-none" aria-hidden />
            {toolStatus}
          </p>
        )}

        {text ? (
          <Markdown>{text}</Markdown>
        ) : streaming && !toolStatus ? (
          <span className="inline-block h-4 w-1.5 animate-pulse rounded-sm bg-slate-300 align-middle motion-reduce:animate-none" aria-hidden />
        ) : null}

        {text && !streaming && (
          <button
            onClick={copy}
            aria-label="Copy reply"
            className="absolute right-2 top-2 rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] text-slate-500 opacity-0 transition-opacity hover:text-slate-700 group-hover:opacity-100 focus-visible:opacity-100"
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
        )}
      </div>
    </div>
  );
}

function ConfirmCard({
  item,
  onConfirm,
  onCancel,
  onDownload,
}: {
  item: Extract<Item, { kind: 'card' }>;
  onConfirm: () => void;
  onCancel: () => void;
  onDownload: () => void;
}) {
  const { card, state } = item;
  return (
    <div className="max-w-[85%] rounded-2xl border border-amber-300 bg-amber-50 p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <span className="rounded-md bg-amber-200 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-800">Confirm required</span>
        <span className="text-sm font-semibold text-[var(--ink)]">{card.title}</span>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-[var(--ink-2)]">{card.summary}</p>

      {card.details && card.details.length > 0 && (
        <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1.5 rounded-lg bg-white/60 p-3 text-xs sm:grid-cols-2">
          {card.details.map((d) => (
            <div key={d.label} className="flex justify-between gap-3">
              <dt className="text-[var(--ink-2)]">{d.label}</dt>
              <dd className="text-right font-medium text-[var(--ink)]">{d.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {card.body && (
        <div className="mt-3 rounded-lg border border-amber-200 bg-white/70 p-3 text-xs leading-relaxed text-[var(--ink-2)]">
          <p className="mb-1 font-semibold uppercase tracking-wide text-slate-500">Cover narrative</p>
          <p className="whitespace-pre-wrap">{card.body}</p>
        </div>
      )}

      {state === 'pending' && (
        <div className="mt-3 flex gap-2">
          <button onClick={onConfirm} className="rounded-lg bg-teal-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-teal-700">
            Confirm
          </button>
          <button onClick={onCancel} className="rounded-lg border border-slate-300 bg-white px-4 py-1.5 text-sm text-[var(--ink-2)] hover:bg-slate-50">
            Cancel
          </button>
        </div>
      )}
      {state === 'working' && <p className="mt-3 text-sm text-[var(--ink-2)]">Working…</p>}
      {state === 'confirmed' && (
        <div className="mt-3 space-y-2">
          <p className="text-sm font-medium text-teal-700">✓ {item.result || 'Done.'}</p>
          {item.download && (
            <button onClick={onDownload} className="rounded-lg bg-teal-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-teal-700">
              Download {item.download.fileName}
            </button>
          )}
        </div>
      )}
      {state === 'cancelled' && <p className="mt-3 text-sm text-slate-500">Cancelled.</p>}
    </div>
  );
}
