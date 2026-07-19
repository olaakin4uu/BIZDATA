'use client';

import { useEffect, useRef, useState } from 'react';
import PageHeader from '@/components/PageHeader';
import { irisApi, downloadIrisExport, type IrisCard } from '@/lib/api/iris';
import { extractErrorMessage } from '@/lib/utils';

type Item =
  | { kind: 'text'; role: 'user' | 'assistant'; text: string }
  | {
      kind: 'card';
      card: IrisCard;
      state: 'pending' | 'confirmed' | 'cancelled' | 'working';
      result?: string;
      download?: { exportId: string; fileName: string };
    };

const SUGGESTIONS = [
  'Show me the top 10 cases for 2025',
  'Generate an Excel report of open cases',
  'Run the 2025 scan at a 20% threshold',
];

export default function IrisPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [conversationId, setConversationId] = useState<string | undefined>(undefined);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [items, loading]);

  async function send(message: string) {
    const text = message.trim();
    if (!text || loading) return;
    setError('');
    setInput('');
    setItems((prev) => [...prev, { kind: 'text', role: 'user', text }]);
    setLoading(true);
    try {
      const res = await irisApi.chat(text, conversationId);
      setConversationId(res.conversationId);
      setItems((prev) => {
        const next = [...prev];
        if (res.reply) next.push({ kind: 'text', role: 'assistant', text: res.reply });
        for (const card of res.cards) next.push({ kind: 'card', card, state: 'pending' });
        return next;
      });
    } catch (e) {
      setError(extractErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  function updateCard(draftId: string, patch: Partial<Extract<Item, { kind: 'card' }>>) {
    setItems((prev) =>
      prev.map((it) => (it.kind === 'card' && it.card.draftId === draftId ? { ...it, ...patch } : it)),
    );
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

  return (
    <div className="flex h-[calc(100vh-7rem)] flex-col">
      <PageHeader
        title="IRIS"
        icon="robot"
        subtitle="Your revenue-intelligence assistant. Ask it to find cases, run a scan, export an encrypted report, or draft a §35 notice. Sensitive actions always ask for your confirmation first."
      />

      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50/60 p-4">
        {items.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-600 text-lg font-semibold text-white">IR</span>
            <p className="max-w-md text-sm text-[var(--ink-2)]">
              Hello — I&apos;m IRIS. I can only tell you what the detection engine and the data show, and I&apos;ll ask you to
              confirm anything that changes a case, sends a notice, or exports data.
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
            <div key={i} className={`flex ${it.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[80%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                  it.role === 'user'
                    ? 'bg-teal-600 text-white'
                    : 'border border-slate-200 bg-white text-[var(--ink)]'
                }`}
              >
                {it.text}
              </div>
            </div>
          ) : (
            <ConfirmCard
              key={i}
              item={it}
              onConfirm={() => confirmCard(it.card)}
              onCancel={() => cancelCard(it.card)}
              onDownload={() => it.download && downloadIrisExport(it.download.exportId, it.download.fileName)}
            />
          ),
        )}

        {loading && (
          <div className="flex justify-start">
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-[var(--ink-2)]">
              IRIS is thinking…
            </div>
          </div>
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
    <div className="max-w-[80%] rounded-2xl border border-amber-300 bg-amber-50 p-4">
      <div className="flex items-center gap-2">
        <span className="rounded-md bg-amber-200 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-800">
          Confirm required
        </span>
        <span className="text-sm font-semibold text-[var(--ink)]">{card.title}</span>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-[var(--ink-2)]">{card.summary}</p>

      {card.details && (
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
          {Object.entries(card.details).map(([k, v]) => (
            <div key={k} className="flex justify-between border-b border-amber-200/60 py-0.5">
              <dt className="text-[var(--ink-2)]">{k}</dt>
              <dd className="font-medium text-[var(--ink)]">{String(v)}</dd>
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
