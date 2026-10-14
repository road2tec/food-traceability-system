import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { checkpointSchema } from '../../utils/schemas';
import { EVENT_TYPES } from '../../utils/constants';
import { Field, FormError, SelectOptions } from '../../components/ui/Form';
import { Alert } from '../../components/ui/States';
import * as batchService from '../../services/batchService';
import { parseError } from '../../services/api';
import { localInputToIso, nowLocalInput } from '../../utils/format';

/**
 * Checkpoint entry. Either `batchId` is fixed, or `batches` supplies options for a select.
 * `eventTypes` can restrict the choices (e.g. SALE only for retail sell flow).
 */
export default function CheckpointForm({ batchId, batches = [], defaultEventType = '', remarksPrefix = '', eventTypes = EVENT_TYPES, onSaved }) {
  const [serverError, setServerError] = useState(null);
  const [saved, setSaved] = useState(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(checkpointSchema),
    defaultValues: {
      batchId: batchId || '',
      eventType: defaultEventType,
      temperatureC: '',
      humidityPct: '',
      location: '',
      eventTimestamp: nowLocalInput(),
      remarks: remarksPrefix,
    },
  });

  const onSubmit = async (v) => {
    setServerError(null);
    setSaved(null);
    try {
      const result = await batchService.createCheckpoint(v.batchId, {
        eventType: v.eventType,
        temperatureC: Number(v.temperatureC),
        humidityPct: Number(v.humidityPct),
        location: v.location,
        eventTimestamp: localInputToIso(v.eventTimestamp),
        ...(v.remarks ? { remarks: v.remarks } : {}),
      });
      setSaved(result);
      reset({ batchId: v.batchId, eventType: v.eventType, temperatureC: '', humidityPct: '', location: v.location, eventTimestamp: nowLocalInput(), remarks: remarksPrefix });
      onSaved?.(result);
    } catch (err) {
      setServerError(parseError(err));
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="card space-y-4 p-6" aria-label="Checkpoint form">
      <FormError error={serverError} />
      {saved && <Alert tone="success">Checkpoint recorded. The freshness estimate and integrity hash are updated by the server.</Alert>}
      <div className="grid gap-4 sm:grid-cols-2">
        {batchId ? (
          <input type="hidden" {...register('batchId')} />
        ) : (
          <Field label="Batch" error={errors.batchId?.message} required className="sm:col-span-2">
            <select className="input" {...register('batchId')}>
              <option value="">Select a batch</option>
              {batches.map((b) => (
                <option key={b.batchId} value={b.batchId}>{b.batchId} - {b.productName}</option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Event type" error={errors.eventType?.message} required>
          <select className="input" {...register('eventType')}>
            <SelectOptions values={eventTypes} placeholder="Select event" />
          </select>
        </Field>
        <Field label="Timestamp" error={errors.eventTimestamp?.message} required>
          <input type="datetime-local" className="input" {...register('eventTimestamp')} />
        </Field>
        <Field label="Temperature (°C)" error={errors.temperatureC?.message} required>
          <input inputMode="decimal" className="input" {...register('temperatureC')} />
        </Field>
        <Field label="Humidity (% RH)" error={errors.humidityPct?.message} required>
          <input inputMode="decimal" className="input" {...register('humidityPct')} />
        </Field>
        <Field label="Location" error={errors.location?.message} required className="sm:col-span-2">
          <input className="input" {...register('location')} />
        </Field>
        <Field label="Remarks" error={errors.remarks?.message} className="sm:col-span-2">
          <textarea rows={2} className="input" {...register('remarks')} />
        </Field>
      </div>
      <button type="submit" className="btn-primary" disabled={isSubmitting}>
        {isSubmitting ? 'Saving…' : 'Record checkpoint'}
      </button>
    </form>
  );
}
