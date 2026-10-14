import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Pencil, PlusCircle } from 'lucide-react';
import { useListQuery } from '../../hooks/useListQuery';
import { useApi } from '../../hooks/useApi';
import * as orgService from '../../services/orgService';
import * as adminService from '../../services/adminService';
import DataTable from '../../components/ui/DataTable';
import { PageHeader, Section } from '../../components/ui/Cards';
import { Modal } from '../../components/ui/Modal';
import { Alert, ErrorState, Skeleton } from '../../components/ui/States';
import { Field, FormError, SelectOptions } from '../../components/ui/Form';
import { parseError } from '../../services/api';
import { CATEGORIES } from '../../utils/constants';
import { numberText, productTypeSchema } from '../../utils/schemas';
import { titleCase } from '../../utils/format';
import { z } from 'zod';

const toForm = (t) => ({
  name: t?.name ?? '',
  category: t?.category ?? '',
  referenceTempC: String(t?.referenceTempC ?? ''),
  referenceShelfLifeHours: String(t?.referenceShelfLifeHours ?? ''),
  activationEnergyJPerMol: String(t?.activationEnergyJPerMol ?? ''),
  safeAbove: String(t?.qualityThresholds?.safeAbove ?? 60),
  flagAbove: String(t?.qualityThresholds?.flagAbove ?? 40),
  humidityMin: String(t?.humidityRange?.min ?? ''),
  humidityMax: String(t?.humidityRange?.max ?? ''),
  tempMin: String(t?.tempRange?.min ?? ''),
  tempMax: String(t?.tempRange?.max ?? ''),
  sourceNote: t?.sourceNote ?? '',
  isDemonstration: t ? Boolean(t.isDemonstration) : true,
});

const toPayload = (v) => ({
  name: v.name,
  category: v.category,
  referenceTempC: Number(v.referenceTempC),
  referenceShelfLifeHours: Number(v.referenceShelfLifeHours),
  activationEnergyJPerMol: Number(v.activationEnergyJPerMol),
  qualityThresholds: { safeAbove: Number(v.safeAbove), flagAbove: Number(v.flagAbove) },
  humidityRange: { min: Number(v.humidityMin), max: Number(v.humidityMax) },
  tempRange: { min: Number(v.tempMin), max: Number(v.tempMax) },
  sourceNote: v.sourceNote,
  isDemonstration: v.isDemonstration,
});

function TypeModal({ type, onClose, onSaved }) {
  const [err, setErr] = useState(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({ resolver: zodResolver(productTypeSchema), defaultValues: toForm(type) });
  const submit = async (v) => {
    setErr(null);
    try {
      if (type?._id || type?.id) await orgService.updateProductType(type._id || type.id, toPayload(v));
      else await orgService.createProductType(toPayload(v));
      onSaved();
    } catch (e) {
      setErr(parseError(e));
    }
  };
  const f = (name, label, props = {}) => (
    <Field label={label} error={errors[name]?.message} required={!props.optional}>
      <input className="input" inputMode={props.numeric ? 'decimal' : undefined} {...register(name)} />
    </Field>
  );
  return (
    <Modal open wide title={type ? `Edit ${type.name}` : 'New product type'} onClose={onClose}>
      <form onSubmit={handleSubmit(submit)} noValidate className="space-y-4" aria-label="Product type form">
        <FormError error={err} />
        <div className="grid gap-4 sm:grid-cols-2">
          {f('name', 'Name')}
          <Field label="Category" error={errors.category?.message} required>
            <select className="input" {...register('category')}><SelectOptions values={CATEGORIES} placeholder="Select" /></select>
          </Field>
          {f('referenceTempC', 'Reference temperature (°C)', { numeric: true })}
          {f('referenceShelfLifeHours', 'Reference shelf life (hours)', { numeric: true })}
          {f('activationEnergyJPerMol', 'Activation energy (J/mol)', { numeric: true })}
          <div />
          {f('safeAbove', 'SAFE above (score)', { numeric: true })}
          {f('flagAbove', 'FLAGGED above (score)', { numeric: true })}
          {f('tempMin', 'Allowed temp min (°C)', { numeric: true })}
          {f('tempMax', 'Allowed temp max (°C)', { numeric: true })}
          {f('humidityMin', 'Allowed humidity min (%)', { numeric: true })}
          {f('humidityMax', 'Allowed humidity max (%)', { numeric: true })}
        </div>
        <Field label="Source note / citation" error={errors.sourceNote?.message} hint="Required. Parameters without a citation must be marked as demonstration values." required>
          <textarea rows={2} className="input" {...register('sourceNote')} />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="h-4 w-4 rounded border-paper-300" {...register('isDemonstration')} /> Demonstration values (not validated against a food-safety standard)
        </label>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={isSubmitting}>{isSubmitting ? 'Saving…' : 'Save product type'}</button>
        </div>
      </form>
    </Modal>
  );
}

const thresholdSchema = z.object({ safeAbove: numberText('SAFE above', 0, 100), flagAbove: numberText('FLAGGED above', 0, 100) })
  .refine((d) => Number(d.flagAbove) < Number(d.safeAbove), { path: ['flagAbove'], message: 'FLAGGED threshold must be below SAFE threshold' });

function GlobalThresholds() {
  const { data, loading, error, reload } = useApi(adminService.getThresholds, []);
  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState(null);
  const src = data?.qualityThresholds || data || {};
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(thresholdSchema),
    values: { safeAbove: String(src.safeAbove ?? 60), flagAbove: String(src.flagAbove ?? 40) },
  });
  if (loading) return <Skeleton className="h-24 w-full" />;
  if (error) return <ErrorState error={error} onRetry={reload} title="Could not load thresholds" />;
  const submit = async (v) => {
    setMsg(null); setErr(null);
    try {
      await adminService.updateThresholds({ ...(data || {}), safeAbove: Number(v.safeAbove), flagAbove: Number(v.flagAbove) });
      setMsg('Thresholds saved.');
      reload();
    } catch (e) { setErr(parseError(e)); }
  };
  return (
    <form onSubmit={handleSubmit(submit)} noValidate className="grid max-w-xl gap-4 sm:grid-cols-2" aria-label="Global thresholds form">
      <div className="sm:col-span-2 space-y-2">
        <Alert tone="warn">Demonstration defaults only. They are not food-safety standards.</Alert>
        {msg && <Alert tone="success">{msg}</Alert>}
        <FormError error={err} />
      </div>
      <Field label="SAFE when score above" error={errors.safeAbove?.message}><input className="input" inputMode="decimal" {...register('safeAbove')} /></Field>
      <Field label="FLAGGED when score above (else QUARANTINED)" error={errors.flagAbove?.message}><input className="input" inputMode="decimal" {...register('flagAbove')} /></Field>
      <div><button type="submit" className="btn-primary" disabled={isSubmitting}>{isSubmitting ? 'Saving…' : 'Save thresholds'}</button></div>
    </form>
  );
}

export default function ProductTypesPage() {
  const list = useListQuery(orgService.listProductTypes, { sort: 'name' });
  const [editing, setEditing] = useState(undefined); // undefined=closed, null=new
  const columns = [
    { key: 'name', header: 'Name', sortField: 'name' },
    { key: 'category', header: 'Category', render: (t) => titleCase(t.category) },
    { key: 'ref', header: 'Ref. temp', render: (t) => `${t.referenceTempC} °C` },
    { key: 'life', header: 'Ref. shelf life', render: (t) => `${t.referenceShelfLifeHours} h` },
    { key: 'thr', header: 'SAFE / FLAGGED above', render: (t) => `${t.qualityThresholds?.safeAbove ?? '—'} / ${t.qualityThresholds?.flagAbove ?? '—'}` },
    { key: 'demo', header: 'Parameters', render: (t) => (t.isDemonstration ? <span className="text-amber-700">Demonstration</span> : 'Cited') },
    { key: 'actions', header: '', render: (t) => <button type="button" className="btn-secondary px-2.5 py-1 text-xs" onClick={() => setEditing(t)} aria-label={`Edit ${t.name}`}><Pencil className="h-3.5 w-3.5" aria-hidden="true" /> Edit</button> },
  ];
  return (
    <>
      <PageHeader
        title="Product types and thresholds"
        subtitle="Freshness model parameters and quality thresholds per product."
        actions={<button type="button" className="btn-primary" onClick={() => setEditing(null)}><PlusCircle className="h-4 w-4" aria-hidden="true" /> New product type</button>}
      />
      <div className="space-y-6">
        <DataTable
          caption="Product types" columns={columns} rows={list.rows} loading={list.loading} error={list.error} onRetry={list.reload}
          meta={list.meta} page={list.page} onPage={list.setPage} sortBy={list.sortBy} onSort={list.toggleSort}
          rowKey={(t) => t._id || t.id} emptyTitle="No product types" emptyMessage="Create a product type so producers can register batches."
        />
        <Section title="Global quality thresholds"><GlobalThresholds /></Section>
      </div>
      {editing !== undefined && <TypeModal type={editing} onClose={() => setEditing(undefined)} onSaved={() => { setEditing(undefined); list.reload(); }} />}
    </>
  );
}
