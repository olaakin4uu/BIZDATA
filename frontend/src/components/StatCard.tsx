interface StatCardProps {
  label: string;
  value: string | number;
  hint?: string;
  tone?: 'default' | 'teal' | 'amber' | 'red' | 'emerald' | 'blue';
}

// Semantic tones map to state colours (separate from the brand accent).
const TONE_CLASS: Record<NonNullable<StatCardProps['tone']>, string> = {
  default: 'text-[var(--ink)]',
  teal: 'text-teal-700',
  amber: 'text-[var(--warn)]',
  red: 'text-[var(--bad)]',
  emerald: 'text-[var(--ok)]',
  blue: 'text-[var(--info)]',
};

export function StatCard({ label, value, hint, tone = 'default' }: StatCardProps) {
  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5 transition-shadow hover:shadow-[0_1px_3px_rgba(15,23,41,0.06)]">
      <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--ink-3)]">{label}</p>
      <p className={`tnum mt-1.5 text-[1.7rem] font-semibold leading-none tracking-tight ${TONE_CLASS[tone]}`}>{value}</p>
      {hint && <p className="mt-1.5 text-xs text-[var(--ink-3)]">{hint}</p>}
    </div>
  );
}

export default StatCard;
