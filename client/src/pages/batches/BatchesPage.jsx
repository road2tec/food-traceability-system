import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, PlusCircle } from 'lucide-react';
import { useAuth } from '../../features/auth/AuthContext';
import { useListQuery } from '../../hooks/useListQuery';
import * as batchService from '../../services/batchService';
import DataTable from '../../components/ui/DataTable';
import { PageHeader } from '../../components/ui/Cards';
import { StatusBadge } from '../../components/ui/Badges';
import { SelectOptions } from '../../components/ui/Form';
import { BATCH_STATUSES, LIFECYCLES } from '../../utils/constants';
import { formatDate, formatNumber, orgName, titleCase, triggerDownload } from '../../utils/format';
import { canRegisterBatch } from '../../utils/permissions';

function scoreOf(b) {
  const p = b.latestPrediction;
  if (p && typeof p === 'object') return p.score ?? p.freshnessScore;
  return b.freshnessScore;
}

export function batchesToCsv(rows) {
  const head = ['batchId', 'productName', 'category', 'status', 'lifecycle', 'custodian', 'freshnessScore', 'createdAt'];
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = rows.map((b) =>
    [b.batchId, b.productName, b.category, b.status, b.lifecycle, orgName(b.currentCustodianOrg), scoreOf(b) ?? '', b.createdAt].map(esc).join(','),
  );
  return [head.join(','), ...lines].join('\n');
}

export default function BatchesPage() {
  const { user } = useAuth();
  const [status, setStatus] = useState('');
  const [lifecycle, setLifecycle] = useState('');
  const list = useListQuery(batchService.listBatches, { filters: { status, lifecycle } });

  const columns = [
    {
      key: 'batchId', header: 'Batch', sortField: 'batchId',
      render: (b) => <Link to={`/app/batches/${b.batchId}`} className="font-mono text-xs font-medium text-forest-600 hover:underline">{b.batchId}</Link>,
    },
    { key: 'productName', header: 'Product', sortField: 'productName' },
    { key: 'category', header: 'Category', render: (b) => titleCase(b.category) },
    { key: 'status', header: 'Status', sortField: 'status', render: (b) => <StatusBadge status={b.status} /> },
    { key: 'lifecycle', header: 'Lifecycle', render: (b) => titleCase(b.lifecycle) },
    { key: 'custodian', header: 'Custodian', render: (b) => orgName(b.currentCustodianOrg) },
    { key: 'score', header: 'Freshness', render: (b) => formatNumber(scoreOf(b), 0) },
    { key: 'createdAt', header: 'Created', sortField: 'createdAt', render: (b) => formatDate(b.createdAt, false) },
  ];

  const exportCsv = () => triggerDownload(new Blob([batchesToCsv(list.rows)], { type: 'text/csv' }), 'batches.csv');

  return (
    <>
      <PageHeader
        title={user.role === 'ADMIN' ? 'All batches' : 'Batches'}
        subtitle="Batches your organisation produced, holds, or is transferring."
        actions={
          <>
            <button type="button" className="btn-secondary" onClick={exportCsv} disabled={list.rows.length === 0}>
              <Download className="h-4 w-4" aria-hidden="true" /> Export page as CSV
            </button>
            {canRegisterBatch(user.role) && (
              <Link to="/app/batches/new" className="btn-primary"><PlusCircle className="h-4 w-4" aria-hidden="true" /> Register batch</Link>
            )}
          </>
        }
      />
      <DataTable
        caption="Batches"
        columns={columns}
        rows={list.rows}
        loading={list.loading}
        error={list.error}
        onRetry={list.reload}
        meta={list.meta}
        page={list.page}
        onPage={list.setPage}
        sortBy={list.sortBy}
        onSort={list.toggleSort}
        search={list.q}
        onSearch={list.setQ}
        searchPlaceholder="Search batch ID or product"
        rowKey={(b) => b.batchId}
        emptyTitle="No batches yet"
        emptyMessage={canRegisterBatch(user.role) ? 'Register your first batch to get started.' : 'Batches appear here once custody is transferred to you.'}
        toolbar={
          <div className="flex flex-wrap gap-2">
            <select aria-label="Filter by status" className="input w-auto" value={status} onChange={(e) => setStatus(e.target.value)}>
              <SelectOptions values={BATCH_STATUSES} placeholder="All statuses" />
            </select>
            <select aria-label="Filter by lifecycle" className="input w-auto" value={lifecycle} onChange={(e) => setLifecycle(e.target.value)}>
              <SelectOptions values={LIFECYCLES} placeholder="All lifecycle stages" />
            </select>
          </div>
        }
      />
    </>
  );
}
