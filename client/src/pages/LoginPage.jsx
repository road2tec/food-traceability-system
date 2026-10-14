import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Leaf } from 'lucide-react';
import { useAuth } from '../features/auth/AuthContext';
import { loginSchema } from '../utils/schemas';
import { Field, FormError } from '../components/ui/Form';
import { parseError } from '../services/api';

export default function LoginPage() {
  const { login, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [serverError, setServerError] = useState(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(loginSchema), defaultValues: { email: '', password: '' } });

  if (isAuthenticated) return <Navigate to="/app" replace />;

  const onSubmit = async (values) => {
    setServerError(null);
    try {
      await login(values);
      navigate(location.state?.from && location.state.from.startsWith('/app') ? location.state.from : '/app', { replace: true });
    } catch (err) {
      const e = parseError(err);
      setServerError(
        e.code === 'UNAUTHENTICATED' || e.status === 401
          ? { message: 'Incorrect email or password.' }
          : e.code === 'FORBIDDEN'
            ? { message: e.message || 'This account is not active yet. It may be awaiting administrator approval.' }
            : e,
      );
    }
  };

  return (
    <div className="mx-auto flex min-h-[calc(100vh-3.5rem)] max-w-md flex-col justify-center px-4 py-10">
      <div className="mb-6 text-center">
        <span className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-forest-900 text-amber-400"><Leaf className="h-5 w-5" aria-hidden="true" /></span>
        <h1 className="text-2xl font-semibold">Sign in</h1>
        <p className="mt-1 text-sm text-ink-soft">Access your organisation's traceability workspace.</p>
      </div>
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="card space-y-4 p-6" aria-label="Sign in form">
        <FormError error={serverError} />
        <Field label="Email" error={errors.email?.message} required>
          <input type="email" autoComplete="email" className="input" {...register('email')} />
        </Field>
        <Field label="Password" error={errors.password?.message} required>
          <input type="password" autoComplete="current-password" className="input" {...register('password')} />
        </Field>
        <button type="submit" className="btn-primary w-full" disabled={isSubmitting}>
          {isSubmitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
      <p className="mt-4 text-center text-sm text-ink-soft">
        No account? <Link to="/register" className="font-medium text-forest-600 hover:underline">Register your organisation</Link>
      </p>
    </div>
  );
}
