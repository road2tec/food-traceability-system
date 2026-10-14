import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CheckCircle2 } from 'lucide-react';
import { registerSchema } from '../utils/schemas';
import { ORG_TYPES, REGISTRATION_ROLES, ROLE_LABELS } from '../utils/constants';
import { Field, FormError, SelectOptions } from '../components/ui/Form';
import * as authService from '../services/authService';
import { parseError } from '../services/api';

export default function RegisterPage() {
  const [done, setDone] = useState(false);
  const [serverError, setServerError] = useState(null);
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      name: '', email: '', password: '', confirmPassword: '', role: '', organisationName: '', organisationType: '', address: '', country: '',
    },
  });

  const onSubmit = async (v) => {
    setServerError(null);
    try {
      await authService.register({
        name: v.name,
        email: v.email,
        password: v.password,
        role: v.role,
        organisation: {
          name: v.organisationName,
          type: v.organisationType,
          ...(v.address ? { address: v.address } : {}),
          ...(v.country ? { country: v.country } : {}),
        },
      });
      setDone(true);
    } catch (err) {
      setServerError(parseError(err));
    }
  };

  if (done) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" aria-hidden="true" />
        <h1 className="mt-4 text-2xl font-semibold">Registration received</h1>
        <p className="mt-2 text-ink-soft">
          Your account is <strong>pending approval</strong>. An administrator must activate it before you can sign in.
        </p>
        <Link to="/login" className="btn-primary mt-6">Go to sign in</Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-2xl font-semibold">Register your organisation</h1>
      <p className="mt-1 text-sm text-ink-soft">Accounts are reviewed by an administrator before activation. Consumers do not need an account.</p>
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="card mt-6 space-y-5 p-6" aria-label="Registration form">
        <FormError error={serverError} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name" error={errors.name?.message} required>
            <input autoComplete="name" className="input" {...register('name')} />
          </Field>
          <Field label="Email" error={errors.email?.message} required>
            <input type="email" autoComplete="email" className="input" {...register('email')} />
          </Field>
          <Field label="Password" error={errors.password?.message} hint="At least 8 characters with a letter and a number." required>
            <input type="password" autoComplete="new-password" className="input" {...register('password')} />
          </Field>
          <Field label="Confirm password" error={errors.confirmPassword?.message} required>
            <input type="password" autoComplete="new-password" className="input" {...register('confirmPassword')} />
          </Field>
          <Field label="Role" error={errors.role?.message} required>
            <select
              className="input"
              {...register('role', {
                onChange: (e) => {
                  if (ORG_TYPES.includes(e.target.value)) setValue('organisationType', e.target.value, { shouldValidate: true });
                },
              })}
            >
              <SelectOptions values={REGISTRATION_ROLES} placeholder="Select a role" labels={ROLE_LABELS} />
            </select>
          </Field>
        </div>
        <fieldset className="grid gap-4 border-t border-paper-200 pt-5 sm:grid-cols-2">
          <legend className="mb-2 text-sm font-semibold">Organisation</legend>
          <Field label="Organisation name" error={errors.organisationName?.message} required>
            <input className="input" {...register('organisationName')} />
          </Field>
          <Field label="Organisation type" error={errors.organisationType?.message} required>
            <select className="input" {...register('organisationType')}>
              <SelectOptions values={ORG_TYPES} placeholder="Select a type" labels={ROLE_LABELS} />
            </select>
          </Field>
          <Field label="Address" error={errors.address?.message}>
            <input autoComplete="street-address" className="input" {...register('address')} />
          </Field>
          <Field label="Country" error={errors.country?.message}>
            <input autoComplete="country-name" className="input" {...register('country')} />
          </Field>
        </fieldset>
        <button type="submit" className="btn-primary w-full sm:w-auto" disabled={isSubmitting}>
          {isSubmitting ? 'Submitting…' : 'Submit registration'}
        </button>
      </form>
      <p className="mt-4 text-sm text-ink-soft">
        Already registered? <Link to="/login" className="font-medium text-forest-600 hover:underline">Sign in</Link>
      </p>
    </div>
  );
}
