import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Modal } from '../../components/ui/Modal';
import { Field, FormError } from '../../components/ui/Form';
import { useApi } from '../../hooks/useApi';
import { useAuth } from '../auth/AuthContext';
import * as orgService from '../../services/orgService';
import * as transferService from '../../services/transferService';
import { parseError } from '../../services/api';
import { transferSchema } from '../../utils/schemas';
import { asList } from '../../utils/normalize';
import { idOf } from '../../utils/format';
import { userOrgId } from '../../utils/permissions';

export default function TransferModal({ open, batchId, onClose, onDone }) {
  const { user } = useAuth();
  const [serverError, setServerError] = useState(null);
  const { data, loading, error } = useApi(() => orgService.listOrganisations({ limit: 100 }), [], { enabled: open });
  const orgs = asList(data).filter((o) => idOf(o) !== userOrgId(user) && o.type !== 'ADMIN');
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(transferSchema), defaultValues: { toOrganisationId: '', remarks: '' } });

  const close = () => {
    reset();
    setServerError(null);
    onClose();
  };

  const onSubmit = async (v) => {
    setServerError(null);
    try {
      await transferService.proposeTransfer(batchId, v);
      reset();
      onDone?.();
      onClose();
    } catch (e) {
      setServerError(parseError(e));
    }
  };

  return (
    <Modal open={open} title="Transfer custody" onClose={close}>
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4" aria-label="Transfer custody form">
        <p className="text-sm text-ink-soft">The receiving organisation must accept before custody changes.</p>
        <FormError error={serverError || (error && error)} />
        <Field label="Receiving organisation" error={errors.toOrganisationId?.message} required>
          <select className="input" disabled={loading} {...register('toOrganisationId')}>
            <option value="">{loading ? 'Loading…' : 'Select organisation'}</option>
            {orgs.map((o) => (
              <option key={idOf(o)} value={idOf(o)}>{o.publicName || o.name} ({o.type})</option>
            ))}
          </select>
        </Field>
        <Field label="Remarks" error={errors.remarks?.message}>
          <textarea rows={2} className="input" {...register('remarks')} />
        </Field>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={close}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={isSubmitting}>{isSubmitting ? 'Sending…' : 'Propose transfer'}</button>
        </div>
      </form>
    </Modal>
  );
}
