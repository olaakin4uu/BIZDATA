'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/** GitHub-flavoured Markdown for IRIS replies — tables, bullets, bold, code —
 *  styled to the app's design tokens. */
export default function Markdown({ children }: { children: string }) {
  return (
    <div className="text-sm leading-relaxed text-[var(--ink)]">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
          ul: ({ children }) => <ul className="mb-2 ml-1 list-disc space-y-1 pl-4">{children}</ul>,
          ol: ({ children }) => <ol className="mb-2 ml-1 list-decimal space-y-1 pl-4">{children}</ol>,
          li: ({ children }) => <li className="pl-0.5 marker:text-slate-400">{children}</li>,
          strong: ({ children }) => <strong className="font-semibold text-[var(--ink)]">{children}</strong>,
          em: ({ children }) => <em className="italic">{children}</em>,
          a: ({ children, href }) => (
            <a href={href} className="text-teal-700 underline underline-offset-2 hover:text-teal-800">
              {children}
            </a>
          ),
          code: ({ children }) => (
            <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[0.85em] text-slate-800">{children}</code>
          ),
          h1: ({ children }) => <h3 className="mb-1.5 mt-3 text-[0.95rem] font-semibold first:mt-0">{children}</h3>,
          h2: ({ children }) => <h3 className="mb-1.5 mt-3 text-sm font-semibold first:mt-0">{children}</h3>,
          h3: ({ children }) => <h4 className="mb-1 mt-2 text-sm font-semibold first:mt-0">{children}</h4>,
          hr: () => <hr className="my-3 border-slate-200" />,
          blockquote: ({ children }) => (
            <blockquote className="my-2 border-l-2 border-teal-300 pl-3 text-[var(--ink-2)]">{children}</blockquote>
          ),
          table: ({ children }) => (
            <div className="my-2.5 overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full border-collapse text-xs tabular-nums">{children}</table>
            </div>
          ),
          thead: ({ children }) => <thead className="bg-teal-600 text-white">{children}</thead>,
          th: ({ children }) => <th className="whitespace-nowrap px-2.5 py-1.5 text-left font-semibold">{children}</th>,
          td: ({ children }) => <td className="border-t border-slate-100 px-2.5 py-1.5">{children}</td>,
          tr: ({ children }) => <tr className="even:bg-slate-50/70">{children}</tr>,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
