import { Activity, Building2, CheckCircle2, Clock, Flag, Package, ShieldAlert, ShieldCheck, Thermometer, Truck, Users } from 'lucide-react';
import { useApi } from '../../hooks/useApi';
import * as analytics from '../../services/analyticsService';
import * as orgService from '../../services/orgService';
import { StatCard } from '../../components/ui/Cards';
import { ErrorState } from '../../components/ui/States';
import { formatNumber } from '../../utils/format';
import { pick, toBuckets } from '../../utils/normalize';

const num = (v) => (v === undefined || v === null || typeof v === 'object' ? undefined : v);

function useStatusCounts(summary) {
  const { data } = useApi(analytics.statusDistribution, []);
  const out = {};
  toBuckets(data).forEach((b) => {
    out[b.label] = b.value;
  });
  ['SAFE', 'FLAGGED', 'QUARANTINED', 'PENDING_REVIEW'].forEach((s) => {
    const fromSummary = num(pick(summary, `byStatus.${s}`, `statusCounts.${s}`, `status.${s}`, `statuses.${s}`, s.toLowerCase()));
    if (fromSummary !== undefined) out[s] = fromSummary;
  });
  return out;
}

/** Admin overview cards. Every value is read from the API; missing values render as an em dash. */
export function AdminSummaryCards() {
  const { data: summary, loading, error, reload } = useApi(analytics.summary, []);
  const { data: pending } = useApi(() => orgService.listUsers({ status: 'PENDING', limit: 1 }), []);
  const status = useStatusCounts(summary);

  if (error) return <ErrorState error={error} onRetry={reload} title="Could not load summary" />;
  const pendingUsers = pending?.meta?.total ?? pick(summary, 'pendingActions', 'pendingApprovals', 'pendingUsers');
  const integrityPass = num(pick(summary, 'integrity.passed', 'integrity.PASS', 'integrity.pass', 'integrity.verified', 'integrityPassed'));
  const integrityFail = num(pick(summary, 'integrity.failed', 'integrity.FAIL', 'integrity.fail', 'integrity.mismatch', 'integrityFailed'));
  const f = (v) => (v === undefined ? undefined : formatNumber(v, 0));
  const avg = num(pick(summary, 'avgFreshness', 'averageFreshness', 'avgFreshnessScore', 'freshness.average'));

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Summary">
      <StatCard loading={loading} icon={Users} label="Users" value={f(num(pick(summary, 'users', 'totalUsers', 'users.total')))} />
      <StatCard loading={loading} icon={Building2} label="Organisations" value={f(num(pick(summary, 'organisations', 'totalOrganisations', 'orgs')))} />
      <StatCard loading={loading} icon={Package} label="Batches" value={f(num(pick(summary, 'batches', 'totalBatches', 'batches.total')))} />
      <StatCard loading={loading} icon={Truck} label="In transit" value={f(num(pick(summary, 'inTransit', 'batchesInTransit', 'lifecycle.IN_TRANSIT', 'byLifecycle.IN_TRANSIT')))} />
      <StatCard loading={loading} icon={CheckCircle2} tone="safe" label="Safe" value={f(status.SAFE)} />
      <StatCard loading={loading} icon={Flag} tone="warn" label="Flagged" value={f(status.FLAGGED)} />
      <StatCard loading={loading} icon={ShieldAlert} tone="danger" label="Quarantined" value={f(status.QUARANTINED)} />
      <StatCard loading={loading} icon={Clock} tone="info" label="Pending review" value={f(status.PENDING_REVIEW)} />
      <StatCard loading={loading} icon={Thermometer} tone="warn" label="Excursions" value={f(num(pick(summary, 'excursions', 'excursionCount', 'excursions.total')))} />
      <StatCard loading={loading} icon={Activity} label="Avg freshness" value={avg === undefined ? undefined : `${formatNumber(avg, 1)}`} hint="Model estimate, 0 to 100" />
      <StatCard loading={loading} icon={ShieldCheck} tone="safe" label="Integrity checks passed" value={f(integrityPass)} />
      <StatCard loading={loading} icon={ShieldAlert} tone="danger" label="Integrity checks failed" value={f(integrityFail)} />
      <StatCard loading={loading} icon={Clock} tone="warn" label="Pending approvals" value={f(num(pendingUsers))} hint="Registrations awaiting review" />
    </div>
  );
}

/** Compact cards for non-admin roles (org-scoped by the server). */
export function OrgSummaryCards() {
  const { data: summary, loading, error, reload } = useApi(analytics.summary, []);
  const status = useStatusCounts(summary);
  if (error) return <ErrorState error={error} onRetry={reload} title="Could not load summary" />;
  const f = (v) => (v === undefined ? undefined : formatNumber(v, 0));
  const avg = num(pick(summary, 'avgFreshness', 'averageFreshness', 'avgFreshnessScore', 'freshness.average'));
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Summary">
      <StatCard loading={loading} icon={Package} label="My batches" value={f(num(pick(summary, 'batches', 'totalBatches', 'batches.total')))} />
      <StatCard loading={loading} icon={CheckCircle2} tone="safe" label="Safe" value={f(status.SAFE)} />
      <StatCard loading={loading} icon={Flag} tone="warn" label="Flagged" value={f(status.FLAGGED)} />
      <StatCard loading={loading} icon={ShieldAlert} tone="danger" label="Quarantined" value={f(status.QUARANTINED)} />
      <StatCard loading={loading} icon={Clock} tone="info" label="Pending review" value={f(status.PENDING_REVIEW)} />
      <StatCard loading={loading} icon={Truck} label="In transit" value={f(num(pick(summary, 'inTransit', 'batchesInTransit', 'lifecycle.IN_TRANSIT', 'byLifecycle.IN_TRANSIT')))} />
      <StatCard loading={loading} icon={Thermometer} tone="warn" label="Excursions" value={f(num(pick(summary, 'excursions', 'excursionCount', 'excursions.total')))} />
      <StatCard loading={loading} icon={Activity} label="Avg freshness" value={avg === undefined ? undefined : formatNumber(avg, 1)} hint="Model estimate, 0 to 100" />
    </div>
  );
}
