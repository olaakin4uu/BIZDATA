import Icon, { type IconName } from '@/components/Icon';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  /** Optional icon rendered in a teal chip beside the title. */
  icon?: IconName;
}

export function PageHeader({ title, subtitle, actions, icon }: PageHeaderProps) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <div className="flex items-center gap-2.5">
          {icon && (
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-50 text-teal-700 ring-1 ring-teal-100">
              <Icon name={icon} width={17} height={17} />
            </span>
          )}
          <h1 className="text-[1.35rem] font-semibold tracking-tight text-[var(--ink)]">{title}</h1>
        </div>
        {subtitle && <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-[var(--ink-2)]">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export default PageHeader;
