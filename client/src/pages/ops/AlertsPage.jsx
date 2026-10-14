import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check } from 'lucide-react';
import { useListQuery } from '../../hooks/useListQuery';
import * as alertService from '../../services/alertService';
import DataTable from '../../components/ui/DataTable';
import { PageHeader } from '../../components/ui/Cards';
import { SeverityBadge } from '../../components/ui/Badges';
import { SelectOptions } from '../../components/ui/Form';
import { SEVERITIES } from '../../utils/constants';
import { formatDate, titleCase } from '../../utils/format';
import { parseError } from '../../services/api';

export default function AlertsPage() {
  const [ack, setAck] = useState('false');
  const [severity, setSeverity] = useState('');
  const [error, setError] = useState(null);
  const list = useListQuery(alertService.listAlerts, { filters: { acknowledged: ack, severity } });

  const acknowledge = async (id) => {
    setError(null);
    try {
      await alertService.acknowledgeAlert(id);
      list.reload();
    } catch (e) {
      setError(parseError(e).message);
    }
  };

  const columns = [
    { key: 'sev', header: 'Severity', sortField: 'severity', render: (a) => <SeverityBadge severity={a.severity} /> },
    { key: 'type', header: 'Type', render: (a) => titleCase(a.type) },
    { key: 'message', header: 'Message' },
    { key: 'batch', header: 'Batch', render: (a) => (a.batchId ? <Link className="font-mono text-xs text-forest-600 hover:underline" to={`/app/batches/${a.batchId}`}>{a.batchId}</Link> : '—') },
    { key: 'createdAt', header: 'Raised', sortField: 'createdAt', render: (a) => formatDate(a.createdAt) },
    {
      key: 'ack', header: 'Action',
      render: (a) => a.acknowledged ? <span className="text-xs text-ink-muted">Acknowledged</span> : (
        <button type="button" className="btn-secondary px-2.5 py-1 text-xs" onClick={() => acknowledge(a._id || a.id)} aria-label={`Acknowledge alert: ${a.message}`}>
          <Check className="h-3.5 w-3.5" aria-hidden="true" /> Acknowledge
        </button>
      ),
    },
  ];

  return (
    <>
      <PageHeader title="Alerts" subtitle="Freshness, excursion and integrity alerts for your batches." />
      {error && <p role="alert" className="mb-3 text-sm text-red-700">{error}</p>}
      <DataTable
        caption="Alerts"
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
        rowKey={(a) => a._id || a.id}
        emptyTitle={ack === 'false' ? 'No open alerts' : 'No alerts'}
        emptyMessage="Alerts appear when batches show low freshness, excursions or integrity problems."
        toolbar={
          <div className="flex flex-wrap gap-2">
            <select aria-label="Filter by acknowledgement" className="input w-auto" value={ack} onChange={(e) => setAck(e.target.value)}>
              <option value="false">Unacknowledged</option>
              <option value="true">Acknowledged</option>
              <option value="">All</option>
            </select>
            <select aria-label="Filter by severity" className="input w-auto" value={severity} onChange={(e) => setSeverity(e.target.value)}>
              <SelectOptions values={SEVERITIES} placeholder="All severities" />
            </select>
          </div>
        }
      />
    </>
  );
}
