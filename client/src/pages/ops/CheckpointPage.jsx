import { useSearchParams } from 'react-router-dom';
import CheckpointForm from '../../features/batches/CheckpointForm';
import { PageHeader } from '../../components/ui/Cards';
import { ErrorState, Skeleton } from '../../components/ui/States';
import { useApi } from '../../hooks/useApi';
import { useAuth } from '../../features/auth/AuthContext';
import * as batchService from '../../services/batchService';
import { asList } from '../../utils/normalize';
import { canRecordCheckpoint } from '../../utils/permissions';

export default function CheckpointPage() {
  const [params] = useSearchParams();
  const { user } = useAuth();
  const { data, loading, error, reload } = useApi(() => batchService.listBatches({ limit: 100, sort: '-createdAt' }), []);
  const batches = asList(data).filter((b) => canRecordCheckpoint(user, b) && !['SOLD', 'WITHDRAWN'].includes(b.lifecycle));
  return (
    <div className="max-w-3xl">
      <PageHeader title="Record checkpoint" subtitle="Log temperature, humidity and location for a batch in your custody." />
      {loading ? (
        <Skeleton className="h-72 w-full" />
      ) : error ? (
        <div className="card"><ErrorState error={error} onRetry={reload} /></div>
      ) : batches.length === 0 ? (
        <div className="card p-6 text-sm text-ink-soft">You do not currently hold custody of any batch. Accept an incoming transfer first.</div>
      ) : (
        <CheckpointForm batches={batches} batchId={undefined} key={params.get('batchId') || 'x'} />
      )}
    </div>
  );
}
