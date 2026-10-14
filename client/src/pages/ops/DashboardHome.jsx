import { Link } from 'react-router-dom';
import { ArrowRightLeft, ClipboardPlus, PlusCircle, Upload, Users } from 'lucide-react';
import { useAuth } from '../../features/auth/AuthContext';
import { useApi } from '../../hooks/useApi';
import * as transferService from '../../services/transferService';
import * as orgService from '../../services/orgService';
import { PageHeader, Section } from '../../components/ui/Cards';
import { AdminSummaryCards, OrgSummaryCards } from '../../features/analytics/SummaryCards';
import AnalyticsCharts from '../../features/analytics/AnalyticsCharts';
import { ROLE_LABELS } from '../../utils/constants';
import { idOf, orgName } from '../../utils/format';
import { asList } from '../../utils/normalize';
import { userOrgId } from '../../utils/permissions';

function QuickLink({ to, icon: Icon, children }) {
  return <Link to={to} className="btn-secondary"><Icon className="h-4 w-4" aria-hidden="true" /> {children}</Link>;
}

function PendingTransfers() {
  const { user } = useAuth();
  const { data, loading } = useApi(() => transferService.listTransfers({ state: 'PROPOSED', limit: 50 }), []);
  const incoming = asList(data).filter((t) => idOf(t.toOrg) === userOrgId(user));
  return (
    <Section title="Incoming transfers" actions={<Link to="/app/transfers" className="text-xs font-medium text-forest-600 hover:underline">View all</Link>}>
      {loading ? <p className="text-sm text-ink-soft">Loading…</p> : incoming.length === 0 ? (
        <p className="text-sm text-ink-soft">Nothing waiting for you.</p>
      ) : (
        <ul className="divide-y divide-paper-200 text-sm">
          {incoming.slice(0, 5).map((t) => (
            <li key={t._id || t.id} className="flex items-center justify-between gap-2 py-2">
              <span className="font-mono text-xs">{typeof t.batchId === 'object' ? t.batchId.batchId : t.batchId}</span>
              <span className="truncate text-ink-soft">from {orgName(t.fromOrg)}</span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function PendingApprovals() {
  const { data, loading } = useApi(() => orgService.listUsers({ status: 'PENDING', limit: 5 }), []);
  const rows = asList(data?.data ?? data);
  return (
    <Section title="Registrations awaiting approval" actions={<Link to="/app/admin/users" className="text-xs font-medium text-forest-600 hover:underline">Review</Link>}>
      {loading ? <p className="text-sm text-ink-soft">Loading…</p> : rows.length === 0 ? (
        <p className="text-sm text-ink-soft">No pending registrations.</p>
      ) : (
        <ul className="divide-y divide-paper-200 text-sm">
          {rows.map((u) => <li key={u._id || u.id} className="py-2">{u.name} <span className="text-ink-muted">({ROLE_LABELS[u.role] || u.role}, {orgName(u.organisation)})</span></li>)}
        </ul>
      )}
    </Section>
  );
}

export default function DashboardHome() {
  const { user, role } = useAuth();
  return (
    <>
      <PageHeader
        title={`${ROLE_LABELS[role] || role} overview`}
        subtitle={`Welcome back, ${user?.name}.`}
        actions={
          role === 'PRODUCER' ? <QuickLink to="/app/batches/new" icon={PlusCircle}>Register batch</QuickLink>
          : role === 'ADMIN' ? <QuickLink to="/app/admin/users" icon={Users}>Review users</QuickLink>
          : (
            <>
              <QuickLink to="/app/checkpoints/new" icon={ClipboardPlus}>Record checkpoint</QuickLink>
              <QuickLink to="/app/imports" icon={Upload}>Upload log</QuickLink>
              <QuickLink to="/app/transfers" icon={ArrowRightLeft}>Transfers</QuickLink>
            </>
          )
        }
      />
      <div className="space-y-6">
        {role === 'ADMIN' ? <AdminSummaryCards /> : <OrgSummaryCards />}
        <div className="grid gap-4 lg:grid-cols-2">
          {role === 'ADMIN' ? <PendingApprovals /> : <PendingTransfers />}
        </div>
        <AnalyticsCharts compact />
      </div>
    </>
  );
}
