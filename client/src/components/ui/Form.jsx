import { Children, cloneElement, isValidElement, useId } from 'react';

/** Accessible field wrapper: label, hint, error text, and aria wiring injected into the single child control. */
export function Field({ label, error, hint, required = false, children, className = '' }) {
  const id = useId();
  const errId = `${id}-err`;
  const hintId = `${id}-hint`;
  const child = Children.only(children);
  const describedBy = [error ? errId : null, hint ? hintId : null].filter(Boolean).join(' ') || undefined;
  const control = isValidElement(child)
    ? cloneElement(child, {
        id,
        'aria-invalid': error ? 'true' : undefined,
        'aria-describedby': describedBy,
        className: `${child.props.className || 'input'} ${error ? 'input-error' : ''}`.trim(),
      })
    : child;
  return (
    <div className={className}>
      <label htmlFor={id} className="label">
        {label}
        {required && <span className="text-red-700" aria-hidden="true"> *</span>}
      </label>
      {control}
      {hint && !error && <p id={hintId} className="mt-1 text-xs text-ink-muted">{hint}</p>}
      {error && (
        <p id={errId} role="alert" className="mt-1 text-xs font-medium text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}

export function FormError({ error }) {
  if (!error) return null;
  const message = typeof error === 'string' ? error : error.message;
  const details = typeof error === 'object' && Array.isArray(error.details) ? error.details : [];
  return (
    <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-900">
      <p className="font-medium">{message}</p>
      {details.length > 0 && (
        <ul className="mt-1 list-disc pl-5 text-xs">
          {details.map((d, i) => (
            <li key={i}>{typeof d === 'string' ? d : d.message || JSON.stringify(d)}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function SelectOptions({ values, placeholder, labels = {} }) {
  return (
    <>
      {placeholder && <option value="">{placeholder}</option>}
      {values.map((v) => (
        <option key={v} value={v}>
          {labels[v] || v.replace(/_/g, ' ')}
        </option>
      ))}
    </>
  );
}
