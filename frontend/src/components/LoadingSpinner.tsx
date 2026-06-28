export function LoadingSpinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-12 text-slate-400">
      <span className="inline-block h-4 w-4 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
      <span className="text-sm">{label}</span>
    </div>
  );
}

export default LoadingSpinner;
