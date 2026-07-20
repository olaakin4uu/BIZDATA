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

export default function IrisPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [conversationId, setConversationId] = useState<string | undefined>(undefined);
  const [conversations, setConversations] = useState<IrisConversationSummary[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  const refreshConversations = useCallback(() => {
    irisApi.listConversations().then(setConversations).catch(() => {});
  }, []);

  useEffect(() => refreshConversations(), [refreshConversations]);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [items, loading]);

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
    setItems((prev) => [...prev, { kind: 'text', role: 'user', text }, { kind: 'text', role: 'assistant', text: '', thinking: '' }]);
    setLoading(true);
    await chatStream(text, conversationId, {
      onThinking: (t) => patchLastAssistant((it) => ({ ...it, thinking: (it.thinking ?? '') + t })),
      onDelta: (t) => patchLastAssistant((it) => ({ ...it, text: it.text + t })),
      onError: (m) => {
        setError(m);
        setLoading(false);
        setItems((prev) => {
          const last = prev[prev.length - 1];
          return last && last.kind === 'text' && last.role === 'assistant' && !last.text && !last.thinking ? prev.slice(0, -1) : prev;
        });
      },
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
        setLoading(false);
        refreshConversations();
      },
    });
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
  }

  async function loadConversation(id: string) {
    try {
      const c = await irisApi.getConversation(id);
      setConversationId(c.conversationId);
      setItems(c.messages.map((m) => ({ kind: 'text', role: m.role as 'user' | 'assistant', text: m.text })));
      setError('');
    } catch (e) {
      setError(extractErrorMessage(e));
    }
  }

  return (
    <div>
      <PageHeader
        title="IRIS"
        icon="robot"
        subtitle="Your revenue-intelligence assistant. Ask it to find cases, run a scan, export an encrypted report, or draft a §35 notice. It reasons before answering, and asks you to confirm anything sensitive."
      />

      <div className="flex h-[calc(100vh-11rem)] gap-4">
        <aside className="hidden w-56 shrink-0 flex-col rounded-xl border border-slate-200 bg-white md:flex">
          <button onClick={newChat} className="m-2 rounded-lg bg-teal-600 px-3 py-2 text-sm font-medium text-white hover:bg-teal-700">
            + New chat
          </button>
          <div className="flex-1 overflow-y-auto px-2 pb-2">
            {conversations.length === 0 && <p className="px-2 py-3 text-xs text-slate-400">No conversations yet.</p>}
            {conversations.map((c) => (
              <button
                key={c.id}
                onClick={() => loadConversation(c.id)}
                className={`mb-0.5 w-full truncate rounded-lg px-2.5 py-2 text-left text-xs transition-colors ${
                  c.id === conversationId ? 'bg-teal-50 font-medium text-teal-800' : 'text-[var(--ink-2)] hover:bg-slate-50'
                }`}
                title={c.title ?? 'Conversation'}
              >
                {c.title ?? 'Conversation'}
              </button>
            ))}
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto rounded-xl border border-slate-200 bg-gradient-to-b from-slate-50/80 to-white p-4">
            {items.length === 0 && (
              <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
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
                    <div className="max-w-[80%] whitespace-pre-wrap rounded-2xl rounded-tr-sm bg-teal-600 px-4 py-2.5 text-sm leading-relaxed text-white">
                      {it.text}
                    </div>
                  </div>
                ) : (
                  <AssistantBubble key={i} text={it.text} thinking={it.thinking} streaming={loading && i === items.length - 1} />
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

          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

          <form
            className="mt-3 flex items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
          >
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
              rows={1}
              placeholder="Ask IRIS…"
              className="max-h-32 flex-1 resize-none rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-[var(--ink)] outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="rounded-xl bg-teal-600 px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-teal-700 disabled:opacity-50"
            >
              Send
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

function AssistantBubble({ text, thinking, streaming }: { text: string; thinking?: string; streaming: boolean }) {
  const [open, setOpen] = useState(false);
  const hasThinking = !!thinking && thinking.trim().length > 0;
  const autoShow = streaming && !text; // stream reasoning live until the answer begins
  const show = open || autoShow;
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-teal-600 text-[11px] font-bold text-white">IR</span>
      <div className="min-w-0 max-w-[85%] rounded-2xl rounded-tl-sm border border-slate-200 bg-white px-4 py-3 shadow-sm">
        {hasThinking && (
          <div className="mb-2">
            <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-slate-600">
              <span>{show ? '▾' : '▸'}</span>
              {autoShow ? 'Thinking…' : 'Reasoning'}
            </button>
            {show && (
              <div className="mt-1.5 whitespace-pre-wrap border-l-2 border-slate-200 pl-3 text-xs italic leading-relaxed text-slate-400">
                {thinking}
              </div>
            )}
          </div>
        )}
        {text ? (
          <Markdown>{text}</Markdown>
        ) : streaming ? (
          <span className="inline-block h-4 w-1.5 animate-pulse rounded-sm bg-slate-300 align-middle" />
        ) : null}
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
    <div className="max-w-[80%] rounded-2xl border border-amber-300 bg-amber-50 p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <span className="rounded-md bg-amber-200 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-800">Confirm required</span>
        <span className="text-sm font-semibold text-[var(--ink)]">{card.title}</span>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-[var(--ink-2)]">{card.summary}</p>

      {card.details && (
        <dl className="mt-3 grid grid-cols-1 gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
          {Object.entries(card.details).map(([k, v]) => (
            <div key={k} className="flex justify-between gap-2 border-b border-amber-200/60 py-0.5">
              <dt className="text-[var(--ink-2)]">{k}</dt>
              <dd className="max-w-[60%] truncate font-medium text-[var(--ink)]" title={String(v)}>
                {String(v)}
              </dd>
            </div>
          ))}
        </dl>
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
