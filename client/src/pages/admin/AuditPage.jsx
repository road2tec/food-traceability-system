import { useListQuery } from '../../hooks/useListQuery';
import * as adminService from '../../services/adminService';
import DataTable from '../../components/ui/DataTable';
import { PageHeader } from '../../components/ui/Cards';
import { formatDate, orgName } from '../../utils/format';

const actorName = (a) => (a && typeof a === 'object' ? a.name || a.email || a._id : a || 'system');

export default function AuditPage() {
  const list = useListQuery(adminService.listAuditLogs, { sort: '-at' });
  const columns = [
    { key: 'at', header: 'Time', sortField: 'at', render: (l) => formatDate(l.at || l.createdAt) },
    { key: 'actor', header: 'Actor', render: (l) => actorName(l.actor) },
    { key: 'action', header: 'Action', sortField: 'action' },
    { key: 'entity', header: 'Entity', render: (l) => `${l.entityType || '—'} ${l.entityId || ''}` },
    { key: 'org', header: 'Organisation', render: (l) => (l.orgId ? orgName(l.orgId) : '—') },
    { key: 'details', header: 'Details', render: (l) => (l.details ? <code className="break-all text-[11px]">{typeof l.details === 'string' ? l.details : JSON.stringify(l.details)}</code> : '—') },
  ];
  return (
    <>
      <PageHeader title="Audit logs" subtitle="A record of sensitive actions across the platform." />
      <DataTable
        caption="Audit logs" columns={columns} rows={list.rows} loading={list.loading} error={list.error} onRetry={list.reload}
        meta={list.meta} page={list.page} onPage={list.setPage} sortBy={list.sortBy} onSort={list.toggleSort}
        search={list.q} onSearch={list.setQ} searchPlaceholder="Search actions" rowKey={(l) => l._id || l.id} emptyTitle="No audit entries"
      />
    </>
  );
}
