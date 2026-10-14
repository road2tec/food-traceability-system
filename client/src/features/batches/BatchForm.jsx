import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { batchSchema } from '../../utils/schemas';
import { Field, FormError } from '../../components/ui/Form';
import { Skeleton } from '../../components/ui/States';
import { useApi } from '../../hooks/useApi';
import * as orgService from '../../services/orgService';
import * as batchService from '../../services/batchService';
import { parseError } from '../../services/api';
import { asList } from '../../utils/normalize';

const UNITS = ['kg', 'tonne', 'crate', 'box', 'litre', 'unit'];

export default function BatchForm({ onCreated }) {
  const navigate = useNavigate();
  const [serverError, setServerError] = useState(null);
  const { data, loading, error, reload } = useApi(() => orgService.listProductTypes({ limit: 100 }), []);
  const types = asList(data);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(batchSchema),
    defaultValues: {
      productName: '', productType: '', quantity: '', unit: 'kg', origin: '', harvestDate: '', expiryDate: '', refTempC: '', refHumidityPct: '', internalNotes: '',
    },
  });

  const onSubmit = async (v) => {
    setServerError(null);
    const payload = {
      productName: v.productName,
      productTypeId: v.productType,
      quantity: Number(v.quantity),
      unit: v.unit,
      origin: v.origin,
      harvestDate: new Date(v.harvestDate).toISOString(),
      ...(v.expiryDate ? { expiryDate: new Date(v.expiryDate).toISOString() } : {}),
      ...(v.refTempC !== '' || v.refHumidityPct !== ''
        ? {
            referenceStorage: {
              ...(v.refTempC !== '' ? { tempC: Number(v.refTempC) } : {}),
              ...(v.refHumidityPct !== '' ? { humidityPct: Number(v.refHumidityPct) } : {}),
            },
          }
        : {}),
      ...(v.internalNotes ? { internalNotes: v.internalNotes } : {}),
    };
    try {
      const created = await batchService.createBatch(payload);
      const batch = created?.batch || created;
      if (onCreated) onCreated(batch);
      else navigate(`/app/batches/${batch.batchId}`);
    } catch (err) {
      setServerError(parseError(err));
    }
  };

  if (loading) return <Skeleton className="h-64 w-full" />;
  if (error) {
    return (
      <div role="alert" className="card p-5 text-sm">
        Could not load product types: {error.message}{' '}
        <button type="button" className="font-medium text-forest-600 underline" onClick={reload}>Retry</button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="card space-y-5 p-6" aria-label="Register batch form">
      <FormError error={serverError} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Product name" error={errors.productName?.message} required>
          <input className="input" {...register('productName')} />
        </Field>
        <Field label="Product type" error={errors.productType?.message} hint={types.length === 0 ? 'No product types exist yet. An administrator must create one.' : undefined} required>
          <select className="input" {...register('productType')}>
            <option value="">Select a product type</option>
            {types.map((t) => (
              <option key={t._id || t.id} value={t._id || t.id}>{t.name} ({t.category})</option>
            ))}
          </select>
        </Field>
        <Field label="Quantity" error={errors.quantity?.message} required>
          <input inputMode="decimal" className="input" {...register('quantity')} />
        </Field>
        <Field label="Unit" error={errors.unit?.message} required>
          <select className="input" {...register('unit')}>
            {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </Field>
        <Field label="Origin" error={errors.origin?.message} hint="Farm, region or country" required>
          <input className="input" {...register('origin')} />
        </Field>
        <Field label="Harvest / production date" error={errors.harvestDate?.message} required>
          <input type="date" className="input" {...register('harvestDate')} />
        </Field>
        <Field label="Best-before / expiry date" error={errors.expiryDate?.message}>
          <input type="date" className="input" {...register('expiryDate')} />
        </Field>
      </div>
      <fieldset className="grid gap-4 border-t border-paper-200 pt-5 sm:grid-cols-2">
        <legend className="mb-2 text-sm font-semibold">Recommended storage (optional)</legend>
        <Field label="Temperature (°C)" error={errors.refTempC?.message}>
          <input inputMode="decimal" className="input" {...register('refTempC')} />
        </Field>
        <Field label="Humidity (% RH)" error={errors.refHumidityPct?.message}>
          <input inputMode="decimal" className="input" {...register('refHumidityPct')} />
        </Field>
      </fieldset>
      <Field label="Internal notes" error={errors.internalNotes?.message} hint="Visible to your organisation only; never shown publicly.">
        <textarea rows={3} className="input" {...register('internalNotes')} />
      </Field>
      <button type="submit" className="btn-primary" disabled={isSubmitting}>
        {isSubmitting ? 'Registering…' : 'Register batch'}
      </button>
    </form>
  );
}
