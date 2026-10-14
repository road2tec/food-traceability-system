import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { useListQuery } from '../../hooks/useListQuery';
import { useAction } from '../../hooks/useAction';
import * as batchService from '../../services/batchService';
import DataTable from '../../components/ui/DataTable';
import { PageHeader } from '../../components/ui/Cards';
import { StatusBadge } from '../../components/ui/Badges';
import { Alert } from '../../components/ui/States';
import { ConfirmDialog } from '../../components/ui/Modal';
import { formatDate, formatNumber, orgName } from '../../utils/format';

export default function QuarantinePage() {
  const [target, setTarget] = useState(null);
  const [notice, setNotice] = useState(null);
  const list = useListQuery(batchService.listBatches, { filters: { status: 'QUARANTINED' } });
  const release = useAction((id, reason) => batchService.releaseQuarantine(id, reason));
  const score = (b) => (b.latestPrediction && typeof b.latestPrediction === 'object' ? b.latestPrediction.score ?? b.latestPrediction.freshnessScore : undefined);

  const columns = [
    { key: 'batchId', header: 'Batch', render: (b) => <Link to={`/app/batches/${b.batchId}`} className="font-mono text-xs text-forest-600 hover:underline">{b.batchId}</Link> },
    { key: 'productName', header: 'Product' },
    { key: 'status', header: 'Status', render: (b) => <StatusBadge status={b.status} /> },
    { key: 'score', header: 'Freshness', render: (b) => formatNumber(score(b), 0) },
    { key: 'cust', header: 'Custodian', render: (b) => orgName(b.currentCustodianOrg) },
    { key: 'upd', header: 'Updated', render: (b) => formatDate(b.updatedAt) },
    { key: 'actions', header: '', render: (b) => <button type="button" className="btn-danger px-2.5 py-1 text-xs" onClick={() => setTarget(b)} aria-label={`Review and release ${b.batchId}`}><ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" /> Review / release</button> },
  ];

  return (
    <>
      <PageHeader title="Quarantine review" subtitle="Quarantined batches are never released automatically. Releasing requires a written reason and is audit-logged." />
      {notice && <div className="mb-4"><Alert tone="success">{notice}</Alert></div>}
      <DataTable
        caption="Quarantined batches" columns={columns} rows={list.rows} loading={list.loading} error={list.error} onRetry={list.reload}
        meta={list.meta} page={list.page} onPage={list.setPage} rowKey={(b) => b.batchId}
        emptyTitle="No quarantined batches" emptyMessage="Nothing needs review right now."
      />
      <ConfirmDialog
        open={Boolean(target)}
        title="Release from quarantine"
        message={target ? `Release ${target.batchId} (${target.productName}) from quarantine? This cannot be undone and is recorded in the audit log.` : ''}
        confirmLabel="Release batch"
        danger
        requireReason
        reasonLabel="Reason for release"
        busy={release.busy}
        error={release.error}
        onCancel={() => { release.clear(); setTarget(null); }}
        onConfirm={async (reason) => {
          const r = await release.run(target.batchId, reason);
          if (r !== undefined) { setNotice(`${target.batchId} released from quarantine.`); setTarget(null); list.reload(); }
        }}
      />
    </>
  );
}
