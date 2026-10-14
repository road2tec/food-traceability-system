import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, X } from 'lucide-react';
import { useAuth } from '../../features/auth/AuthContext';
import { useListQuery } from '../../hooks/useListQuery';
import { useAction } from '../../hooks/useAction';
import * as transferService from '../../services/transferService';
import DataTable from '../../components/ui/DataTable';
import { PageHeader } from '../../components/ui/Cards';
import { Pill } from '../../components/ui/Badges';
import { Alert } from '../../components/ui/States';
import { ConfirmDialog } from '../../components/ui/Modal';
import { SelectOptions } from '../../components/ui/Form';
import { TRANSFER_STATES } from '../../utils/constants';
import { formatDate, idOf, orgName } from '../../utils/format';
import { userOrgId } from '../../utils/permissions';

export default function TransfersPage() {
  const { user } = useAuth();
  const [state, setState] = useState('');
  const [notice, setNotice] = useState(null);
  const [accepting, setAccepting] = useState(null);
  const [rejecting, setRejecting] = useState(null);
  const list = useListQuery(transferService.listTransfers, { filters: { state } });
  const accept = useAction((id) => transferService.acceptTransfer(id));
  const reject = useAction((id, reason) => transferService.rejectTransfer(id, reason));
  const mine = userOrgId(user);
  const bid = (t) => (typeof t.batchId === 'object' ? t.batchId.batchId : t.batchId);

  const columns = [
    { key: 'batch', header: 'Batch', render: (t) => <Link className="font-mono text-xs text-forest-600 hover:underline" to={`/app/batches/${bid(t)}`}>{bid(t)}</Link> },
    { key: 'from', header: 'From', render: (t) => orgName(t.fromOrg) },
    { key: 'to', header: 'To', render: (t) => orgName(t.toOrg) },
    { key: 'state', header: 'State', render: (t) => <Pill value={t.state} /> },
    { key: 'created', header: 'Proposed', sortField: 'createdAt', render: (t) => formatDate(t.createdAt) },
    { key: 'reason', header: 'Reason', render: (t) => t.reason || '—' },
    {
      key: 'actions', header: 'Actions',
      render: (t) =>
        t.state === 'PROPOSED' && idOf(t.toOrg) === mine ? (
          <div className="flex gap-2">
            <button type="button" className="btn-primary px-2.5 py-1 text-xs" onClick={() => setAccepting(t)} aria-label={`Accept transfer of ${bid(t)}`}><Check className="h-3.5 w-3.5" aria-hidden="true" /> Accept</button>
            <button type="button" className="btn-secondary px-2.5 py-1 text-xs" onClick={() => setRejecting(t)} aria-label={`Reject transfer of ${bid(t)}`}><X className="h-3.5 w-3.5" aria-hidden="true" /> Reject</button>
          </div>
        ) : t.state === 'PROPOSED' ? <span className="text-xs text-ink-muted">Awaiting receiver</span> : '—',
    },
  ];

  return (
    <>
      <PageHeader title="Custody transfers" subtitle="Accept or reject batches sent to your organisation, and track the ones you sent." />
      {notice && <div className="mb-4"><Alert tone="success">{notice}</Alert></div>}
      <DataTable
        caption="Transfers"
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
        rowKey={(t) => t._id || t.id}
        emptyTitle="No transfers"
        emptyMessage="Transfers sent to or from your organisation appear here."
        toolbar={
          <select aria-label="Filter by state" className="input w-auto" value={state} onChange={(e) => setState(e.target.value)}>
            <SelectOptions values={TRANSFER_STATES} placeholder="All states" />
          </select>
        }
      />
      <ConfirmDialog
        open={Boolean(accepting)}
        title="Accept custody"
        message={accepting ? `Accept batch ${bid(accepting)}? Your organisation becomes its custodian and is responsible for recording its conditions.` : ''}
        confirmLabel="Accept batch"
        busy={accept.busy}
        error={accept.error}
        onCancel={() => { accept.clear(); setAccepting(null); }}
        onConfirm={async () => {
          const r = await accept.run(accepting._id || accepting.id);
          if (r !== undefined) { setNotice(`Transfer of ${bid(accepting)} accepted.`); setAccepting(null); list.reload(); }
        }}
      />
      <ConfirmDialog
        open={Boolean(rejecting)}
        title="Reject transfer"
        message={rejecting ? `Reject batch ${bid(rejecting)}? The sender keeps custody.` : ''}
        confirmLabel="Reject transfer"
        danger
        requireReason
        minReason={5}
        reasonLabel="Reason for rejection"
        busy={reject.busy}
        error={reject.error}
        onCancel={() => { reject.clear(); setRejecting(null); }}
        onConfirm={async (reason) => {
          const r = await reject.run(rejecting._id || rejecting.id, reason);
          if (r !== undefined) { setNotice(`Transfer of ${bid(rejecting)} rejected.`); setRejecting(null); list.reload(); }
        }}
      />
    </>
  );
}
