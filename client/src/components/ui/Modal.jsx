import { useEffect, useId, useRef, useState } from 'react';
import { X } from 'lucide-react';

export function Modal({ open, title, onClose, children, footer, wide = false }) {
  const titleId = useId();
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    document.addEventListener('keydown', onKey);
    const prev = document.activeElement;
    ref.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-forest-950/50 p-0 sm:items-center sm:p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}
    >
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`max-h-[90vh] w-full overflow-y-auto rounded-t-xl bg-white shadow-pop sm:rounded-xl ${wide ? 'sm:max-w-2xl' : 'sm:max-w-md'}`}
      >
        <div className="flex items-start justify-between gap-4 border-b border-paper-200 px-5 py-4">
          <h2 id={titleId} className="text-base font-semibold">{title}</h2>
          <button type="button" className="rounded p-1 text-ink-muted hover:bg-paper-100" onClick={onClose} aria-label="Close dialog">
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-paper-200 px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

/**
 * Confirm dialog. With `requireReason`, a reason (min length) is mandatory before confirming
 * and is passed to onConfirm(reason).
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  danger = false,
  requireReason = false,
  reasonLabel = 'Reason',
  minReason = 10,
  busy = false,
  error,
  onConfirm,
  onCancel,
}) {
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);
  const id = useId();
  const reasonOk = !requireReason || reason.trim().length >= minReason;

  useEffect(() => {
    if (!open) {
      setReason('');
      setTouched(false);
    }
  }, [open]);

  const submit = () => {
    setTouched(true);
    if (!reasonOk) return;
    onConfirm(requireReason ? reason.trim() : undefined);
  };

  return (
    <Modal
      open={open}
      title={title}
      onClose={busy ? undefined : onCancel}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onCancel} disabled={busy}>Cancel</button>
          <button type="button" className={danger ? 'btn-danger' : 'btn-primary'} onClick={submit} disabled={busy}>
            {busy ? 'Working…' : confirmLabel}
          </button>
        </>
      }
    >
      {message && <p className="text-sm text-ink-soft">{message}</p>}
      {requireReason && (
        <div className="mt-3">
          <label htmlFor={id} className="label">
            {reasonLabel} <span className="text-red-700">*</span>
          </label>
          <textarea
            id={id}
            rows={3}
            className={`input ${touched && !reasonOk ? 'input-error' : ''}`}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            aria-invalid={touched && !reasonOk}
            aria-describedby={`${id}-err`}
          />
          {touched && !reasonOk && (
            <p id={`${id}-err`} role="alert" className="mt-1 text-xs text-red-700">
              A reason of at least {minReason} characters is required.
            </p>
          )}
        </div>
      )}
      {error && <p role="alert" className="mt-3 text-sm text-red-700">{typeof error === 'string' ? error : error.message}</p>}
    </Modal>
  );
}
