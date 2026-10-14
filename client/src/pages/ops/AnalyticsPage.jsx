import { PageHeader } from '../../components/ui/Cards';
import AnalyticsCharts from '../../features/analytics/AnalyticsCharts';
import { AdminSummaryCards, OrgSummaryCards } from '../../features/analytics/SummaryCards';
import { useAuth } from '../../features/auth/AuthContext';

export default function AnalyticsPage() {
  const { role } = useAuth();
  return (
    <>
      <PageHeader title="Analytics" subtitle={role === 'ADMIN' ? 'Platform-wide, from live data.' : "Scoped to your organisation's batches, from live data."} />
      <div className="space-y-6">
        {role === 'ADMIN' ? <AdminSummaryCards /> : <OrgSummaryCards />}
        <AnalyticsCharts />
      </div>
    </>
  );
}
