import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import api from '../services/api';
import { USERS, alertTexts, apiError, ok, renderApp } from './utils';

describe('login form', () => {
  it('shows validation errors for empty and malformed input without calling the API', async () => {
    renderApp('/login');
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /^sign in$/i }));
    expect(await screen.findByText('Email is required')).toBeInTheDocument();
    expect(screen.getByText('Password is required')).toBeInTheDocument();

    await user.type(screen.getByLabelText(/email/i), 'not-an-email');
    await user.type(screen.getByLabelText(/password/i), 'x');
    await user.click(screen.getByRole('button', { name: /^sign in$/i }));
    expect(await screen.findByText('Enter a valid email address')).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it('shows a friendly message on bad credentials', async () => {
    renderApp('/login', { routes: { 'POST /auth/login': apiError(401, 'UNAUTHENTICATED', 'Invalid credentials') } });
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/email/i), 'a@b.test');
    await user.type(screen.getByLabelText(/password/i), 'secret123');
    await user.click(screen.getByRole('button', { name: /^sign in$/i }));
    expect(await screen.findByText('Incorrect email or password.')).toBeInTheDocument();
  });

  it('logs in and lands on the role dashboard', async () => {
    renderApp('/login', {
      routes: {
        'POST /auth/login': ok({ token: 'jwt', user: USERS.producer }),
        'GET /auth/me': ok(USERS.producer),
        'GET /alerts': ok([], { total: 0 }),
        'GET /transfers': ok([]),
        'GET /analytics/summary': ok({}),
        'GET /analytics/status-distribution': ok([]),
        'GET /analytics/freshness-distribution': ok([]),
        'GET /analytics/shelf-life-distribution': ok([]),
        'GET /analytics/checkpoint-activity': ok([]),
        'GET /analytics/org-batch-counts': ok([]),
        'GET /analytics/excursions': ok([]),
      },
    });
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/email/i), 'p@x.test');
    await user.type(screen.getByLabelText(/password/i), 'secret123');
    await user.click(screen.getByRole('button', { name: /^sign in$/i }));
    expect(await screen.findByRole('heading', { name: /producer overview/i })).toBeInTheDocument();
    expect(api.post).toHaveBeenCalledWith('/auth/login', { email: 'p@x.test', password: 'secret123' }, undefined);
  });
});

describe('register form', () => {
  it('validates required role, organisation and matching passwords', async () => {
    renderApp('/register');
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /submit registration/i }));
    expect(await screen.findByText('Name must be at least 2 characters')).toBeInTheDocument();
    expect(alertTexts()).toContain('Select a role');
    expect(screen.getByText('Organisation name is required')).toBeInTheDocument();

    await user.type(screen.getByLabelText(/full name/i), 'Dana Dist');
    await user.type(screen.getByLabelText(/^email/i), 'dana@x.test');
    await user.selectOptions(screen.getByLabelText(/^role/i), 'DISTRIBUTOR');
    await user.type(screen.getByLabelText(/organisation name/i), 'FastFreight');
    await user.type(screen.getByLabelText(/^password/i), 'abcdefg1');
    await user.type(screen.getByLabelText(/confirm password/i), 'different1');
    await user.click(screen.getByRole('button', { name: /submit registration/i }));
    expect(await screen.findByText('Passwords do not match')).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it('submits the contract payload and shows the pending-approval message', async () => {
    renderApp('/register', { routes: { 'POST /auth/register': ok({ status: 'PENDING' }) } });
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/full name/i), 'Dana Dist');
    await user.type(screen.getByLabelText(/^email/i), 'dana@x.test');
    await user.type(screen.getByLabelText(/^password/i), 'abcdefg1');
    await user.type(screen.getByLabelText(/confirm password/i), 'abcdefg1');
    await user.selectOptions(screen.getByLabelText(/^role/i), 'DISTRIBUTOR');
    await user.type(screen.getByLabelText(/organisation name/i), 'FastFreight');
    await user.click(screen.getByRole('button', { name: /submit registration/i }));
    expect(await screen.findByText(/pending approval/i)).toBeInTheDocument();
    expect(api.post).toHaveBeenCalledWith(
      '/auth/register',
      { name: 'Dana Dist', email: 'dana@x.test', password: 'abcdefg1', role: 'DISTRIBUTOR', organisation: { name: 'FastFreight', type: 'DISTRIBUTOR' } },
      undefined,
    );
  });
});

describe('batch registration', () => {
  const routes = (post) => ({
    'GET /product-types': ok([{ _id: 'pt1', name: 'Banana', category: 'FRUIT' }]),
    'POST /batches': post,
  });

  it('rejects invalid input', async () => {
    renderApp('/app/batches/new', { user: USERS.producer, routes: routes(ok({})) });
    const user = userEvent.setup();
    await screen.findByLabelText(/product name/i);
    await user.type(screen.getByLabelText(/^quantity/i), '-5');
    await user.click(screen.getByRole('button', { name: /register batch/i }));
    expect(await screen.findByText('Product name is required')).toBeInTheDocument();
    expect(alertTexts()).toContain('Select a product type');
    expect(screen.getByText('Quantity must be at least 0.0001')).toBeInTheDocument();
    expect(screen.getByText('Origin is required')).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it('creates the batch and opens its detail page', async () => {
    const post = vi.fn(() => ok({ batchId: 'FT-20261014-ABC123', productName: 'Bananas' }));
    renderApp('/app/batches/new', {
      user: USERS.producer,
      routes: {
        ...routes(post),
        'GET /batches/FT-20261014-ABC123': ok({
          batchId: 'FT-20261014-ABC123', productName: 'Bananas', status: 'PENDING_REVIEW', lifecycle: 'REGISTERED',
          currentCustodianOrg: { _id: 'o1', name: 'Green Farms' },
        }),
        'GET /batches/FT-20261014-ABC123/checkpoints': ok([]),
        'GET /batches/FT-20261014-ABC123/prediction': ok(null),
      },
    });
    const user = userEvent.setup();
    await screen.findByLabelText(/product name/i);
    await user.type(screen.getByLabelText(/product name/i), 'Bananas');
    await user.selectOptions(screen.getByLabelText(/product type/i), 'pt1');
    await user.type(screen.getByLabelText(/^quantity/i), '250');
    await user.type(screen.getByLabelText(/^origin/i), 'Ecuador');
    await user.type(screen.getByLabelText(/harvest/i), '2026-10-01');
    await user.click(screen.getByRole('button', { name: /register batch/i }));
    await waitFor(() => expect(post).toHaveBeenCalled());
    const body = post.mock.calls[0][0];
    expect(body).toMatchObject({ productName: 'Bananas', productTypeId: 'pt1', quantity: 250, unit: 'kg', origin: 'Ecuador' });
    expect(await screen.findByRole('heading', { name: 'Bananas' })).toBeInTheDocument();
  });

  it('shows server validation errors', async () => {
    renderApp('/app/batches/new', {
      user: USERS.producer,
      routes: routes(apiError(400, 'VALIDATION_ERROR', 'Invalid batch', [{ message: 'origin too short' }])),
    });
    const user = userEvent.setup();
    await screen.findByLabelText(/product name/i);
    await user.type(screen.getByLabelText(/product name/i), 'Bananas');
    await user.selectOptions(screen.getByLabelText(/product type/i), 'pt1');
    await user.type(screen.getByLabelText(/^quantity/i), '5');
    await user.type(screen.getByLabelText(/^origin/i), 'EC');
    await user.type(screen.getByLabelText(/harvest/i), '2026-10-01');
    await user.click(screen.getByRole('button', { name: /register batch/i }));
    const alert = await screen.findByText('Invalid batch');
    expect(within(alert.closest('[role=alert]')).getByText('origin too short')).toBeInTheDocument();
  });
});

describe('checkpoint entry', () => {
  const batch = {
    batchId: 'FT-1', productName: 'Milk', status: 'SAFE', lifecycle: 'IN_STORAGE',
    currentCustodianOrg: { _id: 'o2', name: 'Cold Store' },
  };

  it('validates ranges and required fields', async () => {
    renderApp('/app/checkpoints/new', { user: USERS.warehouse, routes: { 'GET /batches': ok([batch]) } });
    const user = userEvent.setup();
    await screen.findByLabelText(/^batch/i);
    await user.click(screen.getByRole('button', { name: /record checkpoint/i }));
    await waitFor(() => expect(alertTexts()).toContain('Select a batch'));
    expect(screen.getByText('Select an event type')).toBeInTheDocument();
    expect(screen.getByText('Temperature is required')).toBeInTheDocument();
    expect(screen.getByText('Location is required')).toBeInTheDocument();

    await user.type(screen.getByLabelText(/temperature/i), '500');
    await user.type(screen.getByLabelText(/humidity/i), '120');
    await user.click(screen.getByRole('button', { name: /record checkpoint/i }));
    expect(await screen.findByText('Temperature must be at most 80')).toBeInTheDocument();
    expect(screen.getByText('Humidity must be at most 100')).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it('submits a valid checkpoint', async () => {
    const post = vi.fn(() => ok({ checkpointId: 'c1' }));
    renderApp('/app/checkpoints/new', { user: USERS.warehouse, routes: { 'GET /batches': ok([batch]), 'POST /batches/FT-1/checkpoints': post } });
    const user = userEvent.setup();
    await screen.findByLabelText(/^batch/i);
    await user.selectOptions(screen.getByLabelText(/^batch/i), 'FT-1');
    await user.selectOptions(screen.getByLabelText(/event type/i), 'STORAGE');
    await user.type(screen.getByLabelText(/temperature/i), '4.2');
    await user.type(screen.getByLabelText(/humidity/i), '85');
    await user.type(screen.getByLabelText(/location/i), 'Cold room 2');
    await user.click(screen.getByRole('button', { name: /record checkpoint/i }));
    expect(await screen.findByText(/checkpoint recorded/i)).toBeInTheDocument();
    expect(post.mock.calls[0][0]).toMatchObject({ eventType: 'STORAGE', temperatureC: 4.2, humidityPct: 85, location: 'Cold room 2' });
    expect(typeof post.mock.calls[0][0].eventTimestamp).toBe('string');
  });

  it('rejects a timestamp in the future', async () => {
    renderApp('/app/checkpoints/new', { user: USERS.warehouse, routes: { 'GET /batches': ok([batch]) } });
    const user = userEvent.setup();
    await screen.findByLabelText(/^batch/i);
    await user.selectOptions(screen.getByLabelText(/^batch/i), 'FT-1');
    await user.selectOptions(screen.getByLabelText(/event type/i), 'STORAGE');
    await user.type(screen.getByLabelText(/temperature/i), '4');
    await user.type(screen.getByLabelText(/humidity/i), '80');
    await user.type(screen.getByLabelText(/location/i), 'Dock');
    const ts = screen.getByLabelText(/timestamp/i);
    await user.clear(ts);
    await user.type(ts, '2099-01-01T10:00');
    await user.click(screen.getByRole('button', { name: /record checkpoint/i }));
    expect(await screen.findByText('Timestamp cannot be in the future')).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });
});
