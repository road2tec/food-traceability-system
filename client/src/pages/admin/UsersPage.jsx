import { useState } from 'react';
import { useListQuery } from '../../hooks/useListQuery';
import { useAction } from '../../hooks/useAction';
import * as orgService from '../../services/orgService';
import DataTable from '../../components/ui/DataTable';
import { PageHeader } from '../../components/ui/Cards';
import { Pill } from '../../components/ui/Badges';
import { Alert } from '../../components/ui/States';
import { ConfirmDialog } from '../../components/ui/Modal';
import { SelectOptions } from '../../components/ui/Form';
import { ROLE_LABELS, USER_STATUSES } from '../../utils/constants';
import { formatDate, orgName } from '../../utils/format';

const ACTIONS = {
  PENDING: [['ACTIVE', 'Approve', 'btn-primary'], ['REJECTED', 'Reject', 'btn-secondary']],
  ACTIVE: [['SUSPENDED', 'Suspend', 'btn-secondary']],
  SUSPENDED: [['ACTIVE', 'Reactivate', 'btn-primary']],
  REJECTED: [['ACTIVE', 'Approve', 'btn-primary']],
};

export default function UsersPage() {
  const [status, setStatus] = useState('PENDING');
  const [target, setTarget] = useState(null); // {user, next, label}
  const [notice, setNotice] = useState(null);
  const list = useListQuery(orgService.listUsers, { filters: { status } });
  const act = useAction((id, s) => orgService.setUserStatus(id, s));

  const columns = [
    { key: 'name', header: 'Name', sortField: 'name' },
    { key: 'email', header: 'Email', sortField: 'email' },
    { key: 'role', header: 'Role', render: (u) => ROLE_LABELS[u.role] || u.role },
    { key: 'org', header: 'Organisation', render: (u) => orgName(u.organisation) },
    { key: 'status', header: 'Status', render: (u) => <Pill value={u.status} /> },
    { key: 'created', header: 'Registered', sortField: 'createdAt', render: (u) => formatDate(u.createdAt, false) },
    {
      key: 'actions', header: 'Actions',
      render: (u) => u.role === 'ADMIN' ? '—' : (
        <div className="flex flex-wrap gap-2">
          {(ACTIONS[u.status] || []).map(([next, label, cls]) => (
            <button key={next} type="button" className={`${cls} px-2.5 py-1 text-xs`} onClick={() => setTarget({ user: u, next, label })} aria-label={`${label} ${u.name}`}>{label}</button>
          ))}
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader title="Users and registration approval" subtitle="Approve new registrations and manage account access." />
      {notice && <div className="mb-4"><Alert tone="success">{notice}</Alert></div>}
      <DataTable
        caption="Users"
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
        searchPlaceholder="Search name or email"
        rowKey={(u) => u._id || u.id}
        emptyTitle={status === 'PENDING' ? 'No pending registrations' : 'No users'}
        toolbar={
          <select aria-label="Filter by status" className="input w-auto" value={status} onChange={(e) => setStatus(e.target.value)}>
            <SelectOptions values={USER_STATUSES} placeholder="All statuses" />
          </select>
        }
      />
      <ConfirmDialog
        open={Boolean(target)}
        title={target ? `${target.label} account` : ''}
        message={target ? `${target.label} ${target.user.name} (${target.user.email})? Their status becomes ${target.next}.` : ''}
        confirmLabel={target?.label}
        danger={target?.next === 'REJECTED' || target?.next === 'SUSPENDED'}
        busy={act.busy}
        error={act.error}
        onCancel={() => { act.clear(); setTarget(null); }}
        onConfirm={async () => {
          const r = await act.run(target.user._id || target.user.id, target.next);
          if (r !== undefined) { setNotice(`${target.user.name} is now ${target.next}.`); setTarget(null); list.reload(); }
        }}
      />
    </>
  );
}
