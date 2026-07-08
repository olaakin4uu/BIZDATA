import Icon, { type IconName } from '@/components/Icon';

interface StatCardProps {
  label: string;
  value: string | number;
  hint?: string;
  tone?: 'default' | 'teal' | 'amber' | 'red' | 'emerald' | 'blue';
  /** Optional icon shown in a tinted chip matching the tone. */
  icon?: IconName;
}

// Semantic tones map to state colours (separate from the brand accent).
const TONE_CLASS: Record<NonNullable<StatCardProps['tone']>, { value: string; bar: string; chip: string }> = {
  default: { value: 'text-[var(--ink)]', bar: 'bg-slate-200', chip: 'bg-slate-100 text-slate-500 ring-slate-200' },
  teal: { value: 'text-teal-700', bar: 'bg-teal-400', chip: 'bg-teal-50 text-teal-700 ring-teal-100' },
  amber: { value: 'text-[var(--warn)]', bar: 'bg-amber-400', chip: 'bg-amber-50 text-amber-700 ring-amber-100' },
  red: { value: 'text-[var(--bad)]', bar: 'bg-rose-400', chip: 'bg-rose-50 text-rose-700 ring-rose-100' },
  emerald: { value: 'text-[var(--ok)]', bar: 'bg-emerald-400', chip: 'bg-emerald-50 text-emerald-700 ring-emerald-100' },
  blue: { value: 'text-[var(--info)]', bar: 'bg-blue-400', chip: 'bg-blue-50 text-blue-700 ring-blue-100' },
};

export function StatCard({ label, value, hint, tone = 'default', icon }: StatCardProps) {
  const t = TONE_CLASS[tone];
  return (
    <div className="lift relative overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[var(--elev-1)]">
      <span className={`absolute inset-x-0 top-0 h-0.5 ${t.bar}`} aria-hidden />
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--ink-3)]">{label}</p>
        {icon && (
          <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ring-1 ${t.chip}`}>
            <Icon name={icon} width={15} height={15} />
          </span>
        )}
      </div>
      <p className={`tnum mt-1.5 text-[1.7rem] font-semibold leading-none tracking-tight ${t.value}`}>{value}</p>
      {hint && <p className="mt-1.5 text-xs text-[var(--ink-3)]">{hint}</p>}
    </div>
  );
}

export default StatCard;
