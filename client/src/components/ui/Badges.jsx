import { titleCase } from '../../utils/format';

const STATUS_STYLES = {
  SAFE: 'bg-emerald-50 text-emerald-800 ring-emerald-600/25',
  FLAGGED: 'bg-amber-50 text-amber-800 ring-amber-600/30',
  QUARANTINED: 'bg-red-50 text-red-800 ring-red-600/30',
  PENDING_REVIEW: 'bg-slate-100 text-slate-700 ring-slate-500/30',
};

const DOT = {
  SAFE: 'bg-emerald-600',
  FLAGGED: 'bg-amber-500',
  QUARANTINED: 'bg-red-600',
  PENDING_REVIEW: 'bg-slate-500',
};

export const STATUS_COLORS = { SAFE: '#2f855a', FLAGGED: '#d97706', QUARANTINED: '#c53030', PENDING_REVIEW: '#64748b' };

export function StatusBadge({ status }) {
  if (!status) return <span className="text-ink-muted">—</span>;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${STATUS_STYLES[status] || STATUS_STYLES.PENDING_REVIEW}`}>
      <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${DOT[status] || DOT.PENDING_REVIEW}`} />
      {titleCase(status)}
    </span>
  );
}

const SEVERITY = {
  INFO: 'bg-sky-50 text-sky-800 ring-sky-600/25',
  WARNING: 'bg-amber-50 text-amber-800 ring-amber-600/30',
  CRITICAL: 'bg-red-50 text-red-800 ring-red-600/30',
};
export function SeverityBadge({ severity }) {
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${SEVERITY[severity] || SEVERITY.INFO}`}>
      {titleCase(severity || 'INFO')}
    </span>
  );
}

const GENERIC = {
  ACTIVE: 'bg-emerald-50 text-emerald-800 ring-emerald-600/25',
  ACCEPTED: 'bg-emerald-50 text-emerald-800 ring-emerald-600/25',
  PENDING: 'bg-amber-50 text-amber-800 ring-amber-600/30',
  PROPOSED: 'bg-amber-50 text-amber-800 ring-amber-600/30',
  REJECTED: 'bg-red-50 text-red-800 ring-red-600/30',
  SUSPENDED: 'bg-red-50 text-red-800 ring-red-600/30',
  CANCELLED: 'bg-slate-100 text-slate-700 ring-slate-500/30',
};
export function Pill({ value, tone }) {
  const cls = tone || GENERIC[value] || 'bg-paper-100 text-ink-soft ring-paper-300';
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${cls}`}>{titleCase(value)}</span>;
}

export const RISK_STYLES = {
  LOW: 'text-emerald-700',
  MODERATE: 'text-amber-700',
  HIGH: 'text-orange-700',
  CRITICAL: 'text-red-700',
};
