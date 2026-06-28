interface StatCardProps {
  label: string;
  value: string | number;
  hint?: string;
  tone?: 'default' | 'teal' | 'amber' | 'red' | 'emerald' | 'blue';
}

const TONE_CLASS: Record<NonNullable<StatCardProps['tone']>, string> = {
  default: 'text-slate-800',
  teal: 'text-teal-700',
  amber: 'text-amber-700',
  red: 'text-red-700',
  emerald: 'text-emerald-700',
  blue: 'text-blue-700',
};

export function StatCard({ label, value, hint, tone = 'default' }: StatCardProps) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`text-2xl font-bold mt-2 ${TONE_CLASS[tone]}`}>{value}</p>
      {hint && <p className="text-xs text-slate-400 mt-1">{hint}</p>}
    </div>
  );
}

export default StatCard;
