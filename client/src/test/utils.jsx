import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import api from '../services/api';
import { AuthProvider } from '../features/auth/AuthContext';
import AppRoutes from '../app/AppRoutes';

export const ok = (data, meta) => ({ success: true, data, ...(meta ? { meta } : {}) });

export function apiError(status, code, message, details) {
  const err = new Error(message);
  err.response = { status, data: { success: false, error: { code, message, ...(details ? { details } : {}) } } };
  return err;
}

/** routes: { 'GET /path': envelope | (url, config) => envelope | Error } */
export function mockApi(routes) {
  const make = (method) => async (url, ...args) => {
    const h = routes[`${method} ${url}`];
    if (h === undefined) throw apiError(404, 'NOT_FOUND', `no mock for ${method} ${url}`);
    const val = typeof h === 'function' ? h(...args) : h;
    if (val instanceof Error) throw val;
    return { data: val };
  };
  api.get.mockImplementation(make('GET'));
  api.post.mockImplementation(make('POST'));
  api.put.mockImplementation(make('PUT'));
  api.patch.mockImplementation(make('PATCH'));
}

export const USERS = {
  admin: { _id: 'u1', name: 'Ada Admin', email: 'admin@x.test', role: 'ADMIN', status: 'ACTIVE', organisation: { _id: 'o0', name: 'Platform' } },
  producer: { _id: 'u2', name: 'Pia Producer', email: 'p@x.test', role: 'PRODUCER', status: 'ACTIVE', organisation: { _id: 'o1', name: 'Green Farms' } },
  retailer: { _id: 'u3', name: 'Rob Retail', email: 'r@x.test', role: 'RETAILER', status: 'ACTIVE', organisation: { _id: 'o3', name: 'Fresh Mart' } },
  warehouse: { _id: 'u4', name: 'Wes Ware', email: 'w@x.test', role: 'WAREHOUSE', status: 'ACTIVE', organisation: { _id: 'o2', name: 'Cold Store' } },
};

/** Baseline mocks every dashboard page touches, so unrelated widgets do not error. */
export function baseRoutes(user, extra = {}) {
  const empty = ok([], { page: 1, limit: 20, total: 0, totalPages: 1 });
  return {
    'GET /auth/me': ok(user),
    'GET /alerts': empty,
    'GET /transfers': empty,
    'GET /analytics/summary': ok({}),
    'GET /analytics/status-distribution': ok([]),
    'GET /analytics/freshness-distribution': ok([]),
    'GET /analytics/shelf-life-distribution': ok([]),
    'GET /analytics/checkpoint-activity': ok([]),
    'GET /analytics/org-batch-counts': ok([]),
    'GET /analytics/excursions': ok([]),
    'GET /users': empty,
    ...extra,
  };
}

export function renderApp(path, { user, routes = {} } = {}) {
  if (user) {
    localStorage.setItem('ft_token', 'test-token');
    localStorage.setItem('ft_user', JSON.stringify(user));
  }
  mockApi(user ? baseRoutes(user, routes) : routes);
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </MemoryRouter>,
  );
}

/** Text of all rendered role=alert elements (field errors, banners). */
export const alertTexts = () => screen.queryAllByRole('alert').map((e) => e.textContent);
