import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Pencil } from 'lucide-react';
import { useListQuery } from '../../hooks/useListQuery';
import * as orgService from '../../services/orgService';
import DataTable from '../../components/ui/DataTable';
import { PageHeader } from '../../components/ui/Cards';
import { Pill } from '../../components/ui/Badges';
import { Modal } from '../../components/ui/Modal';
import { Field, FormError } from '../../components/ui/Form';
import { parseError } from '../../services/api';
import { titleCase } from '../../utils/format';

const schema = z.object({
  publicName: z.string().trim().min(2, 'Public name is required'),
  address: z.string().trim().optional(),
  country: z.string().trim().optional(),
});

function EditModal({ org, onClose, onSaved }) {
  const [err, setErr] = useState(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { publicName: org.publicName || org.name || '', address: org.address || '', country: org.country || '' },
  });
  const submit = async (v) => {
    setErr(null);
    try {
      await orgService.updateOrganisation(org._id || org.id, v);
      onSaved();
    } catch (e) {
      setErr(parseError(e));
    }
  };
  return (
    <Modal open title={`Edit ${org.name}`} onClose={onClose}>
      <form onSubmit={handleSubmit(submit)} noValidate className="space-y-4" aria-label="Edit organisation">
        <FormError error={err} />
        <Field label="Public name" hint="Shown on the public verification page." error={errors.publicName?.message} required><input className="input" {...register('publicName')} /></Field>
        <Field label="Address" error={errors.address?.message}><input className="input" {...register('address')} /></Field>
        <Field label="Country" error={errors.country?.message}><input className="input" {...register('country')} /></Field>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={isSubmitting}>{isSubmitting ? 'Saving…' : 'Save changes'}</button>
        </div>
      </form>
    </Modal>
  );
}

export default function OrganisationsPage() {
  const list = useListQuery(orgService.listOrganisations, { sort: 'name' });
  const [editing, setEditing] = useState(null);
  const columns = [
    { key: 'name', header: 'Name', sortField: 'name' },
    { key: 'publicName', header: 'Public name', render: (o) => o.publicName || '—' },
    { key: 'type', header: 'Type', render: (o) => titleCase(o.type) },
    { key: 'country', header: 'Country', render: (o) => o.country || '—' },
    { key: 'status', header: 'Status', render: (o) => (o.status ? <Pill value={o.status} /> : '—') },
    { key: 'actions', header: '', render: (o) => <button type="button" className="btn-secondary px-2.5 py-1 text-xs" onClick={() => setEditing(o)} aria-label={`Edit ${o.name}`}><Pencil className="h-3.5 w-3.5" aria-hidden="true" /> Edit</button> },
  ];
  return (
    <>
      <PageHeader title="Organisations" subtitle="Manage organisation details and the public names shown to consumers." />
      <DataTable
        caption="Organisations" columns={columns} rows={list.rows} loading={list.loading} error={list.error} onRetry={list.reload}
        meta={list.meta} page={list.page} onPage={list.setPage} sortBy={list.sortBy} onSort={list.toggleSort}
        search={list.q} onSearch={list.setQ} searchPlaceholder="Search organisations" rowKey={(o) => o._id || o.id} emptyTitle="No organisations"
      />
      {editing && <EditModal org={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); list.reload(); }} />}
    </>
  );
}
