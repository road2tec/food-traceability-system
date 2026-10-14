import { Skeleton } from './States';

export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold sm:text-2xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-ink-soft">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

const TONES = {
  neutral: 'text-ink',
  safe: 'text-emerald-700',
  warn: 'text-amber-700',
  danger: 'text-red-700',
  info: 'text-slate-700',
};

export function StatCard({ label, value, hint, tone = 'neutral', icon: Icon, loading }) {
  return (
    <div className="card p-4" data-testid="stat-card">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">{label}</p>
        {Icon && <Icon className="h-4 w-4 text-ink-muted" aria-hidden="true" />}
      </div>
      {loading ? (
        <Skeleton className="mt-3 h-7 w-16" />
      ) : (
        <p className={`mt-2 text-2xl font-semibold tabular-nums ${TONES[tone]}`}>{value ?? '—'}</p>
      )}
      {hint && <p className="mt-1 text-xs text-ink-muted">{hint}</p>}
    </div>
  );
}

export function Section({ title, actions, children, className = '', padded = true }) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-paper-200 px-4 py-3">
          {title && <h2 className="text-sm font-semibold">{title}</h2>}
          {actions}
        </div>
      )}
      <div className={padded ? 'p-4' : ''}>{children}</div>
    </section>
  );
}

export function DefList({ items }) {
  return (
    <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
      {items.map(([k, v]) => (
        <div key={k}>
          <dt className="text-xs font-medium uppercase tracking-wide text-ink-muted">{k}</dt>
          <dd className="mt-0.5 break-words text-sm text-ink">{v ?? '—'}</dd>
        </div>
      ))}
    </dl>
  );
}
