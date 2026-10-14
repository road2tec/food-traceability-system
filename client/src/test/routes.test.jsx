import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { USERS, ok, renderApp } from './utils';
import { canRecordCheckpoint, canSell, canReleaseQuarantine } from '../utils/permissions';
import { navForRole } from '../utils/constants';

describe('protected routes', () => {
  it('redirects unauthenticated visitors to login', async () => {
    renderApp('/app/batches');
    expect(await screen.findByRole('heading', { name: /sign in/i })).toBeInTheDocument();
  });

  it('shows admin pages to admins', async () => {
    renderApp('/app/admin/users', { user: USERS.admin });
    expect(await screen.findByRole('heading', { name: /users and registration approval/i })).toBeInTheDocument();
  });

  it('blocks non-admins from admin routes', async () => {
    renderApp('/app/admin/users', { user: USERS.producer });
    expect(await screen.findByText('Access denied')).toBeInTheDocument();
  });

  it('blocks producers from handler-only routes and handlers from batch registration', async () => {
    const { unmount } = renderApp('/app/imports', { user: USERS.producer });
    expect(await screen.findByText('Access denied')).toBeInTheDocument();
    unmount();
    renderApp('/app/batches/new', { user: USERS.retailer });
    expect(await screen.findByText('Access denied')).toBeInTheDocument();
  });
});

describe('role navigation', () => {
  it('renders admin navigation items and no chain pages', async () => {
    renderApp('/app', { user: USERS.admin });
    const nav = await screen.findByRole('navigation', { name: 'Main' });
    expect(within(nav).getByRole('link', { name: /quarantine review/i })).toBeInTheDocument();
    expect(within(nav).getByRole('link', { name: /audit logs/i })).toBeInTheDocument();
    expect(within(nav).queryByRole('link', { name: /chain/i })).toBeNull();
    expect(within(nav).queryByRole('link', { name: /register batch/i })).toBeNull();
  });

  it('renders producer navigation', async () => {
    renderApp('/app', { user: USERS.producer });
    const nav = await screen.findByRole('navigation', { name: 'Main' });
    expect(within(nav).getByRole('link', { name: /register batch/i })).toBeInTheDocument();
    expect(within(nav).queryByRole('link', { name: /audit logs/i })).toBeNull();
  });

  it('renders handler navigation and navigates between pages', async () => {
    renderApp('/app', { user: USERS.warehouse });
    const nav = await screen.findByRole('navigation', { name: 'Main' });
    expect(within(nav).getByRole('link', { name: /csv \/ json upload/i })).toBeInTheDocument();
    await userEvent.setup().click(within(nav).getByRole('link', { name: /incoming transfers/i }));
    expect(await screen.findByRole('heading', { name: /custody transfers/i })).toBeInTheDocument();
  });

  it('exposes the mobile menu toggle', async () => {
    renderApp('/app', { user: USERS.producer });
    const btn = await screen.findByRole('button', { name: /open menu/i });
    await userEvent.setup().click(btn);
    expect(screen.getByRole('dialog', { name: /navigation menu/i })).toBeInTheDocument();
  });

  it('navForRole maps all roles', () => {
    ['ADMIN', 'PRODUCER', 'DISTRIBUTOR', 'WAREHOUSE', 'RETAILER'].forEach((r) => expect(navForRole(r).length).toBeGreaterThan(3));
  });
});

describe('batch actions by role and status', () => {
  const mk = (status, lifecycle = 'AT_RETAIL') => ({
    batchId: 'FT-9', productName: 'Spinach', status, lifecycle, currentCustodianOrg: { _id: 'o3', name: 'Fresh Mart' },
  });
  const detailRoutes = (b) => ({
    'GET /batches/FT-9': ok(b),
    'GET /batches/FT-9/checkpoints': ok([]),
    'GET /batches/FT-9/prediction': ok(null),
  });

  it('offers retailers a sell action for SAFE batches', async () => {
    renderApp('/app/batches/FT-9', { user: USERS.retailer, routes: detailRoutes(mk('SAFE')) });
    expect(await screen.findByRole('button', { name: /record sale/i })).toBeInTheDocument();
  });

  it('never offers retailers a sell action for QUARANTINED batches', async () => {
    renderApp('/app/batches/FT-9', { user: USERS.retailer, routes: detailRoutes(mk('QUARANTINED')) });
    await screen.findByText(/this batch is quarantined/i);
    expect(screen.queryByRole('button', { name: /record sale/i })).toBeNull();
  });

  it('permission helpers', () => {
    const q = mk('QUARANTINED');
    expect(canSell(USERS.retailer, q)).toBe(false);
    expect(canSell(USERS.retailer, mk('SAFE'))).toBe(true);
    expect(canSell(USERS.warehouse, mk('SAFE'))).toBe(false);
    expect(canReleaseQuarantine(USERS.admin, q)).toBe(true);
    expect(canReleaseQuarantine(USERS.retailer, q)).toBe(false);
    expect(canRecordCheckpoint(USERS.admin, q)).toBe(false);
  });
});

describe('quarantine release', () => {
  it('requires a reason before calling the API', async () => {
    const batch = {
      batchId: 'FT-Q', productName: 'Milk', status: 'QUARANTINED', lifecycle: 'IN_STORAGE',
      currentCustodianOrg: { _id: 'o2', name: 'Cold Store' },
    };
    let released = null;
    renderApp('/app/admin/quarantine', {
      user: USERS.admin,
      routes: {
        'GET /batches': ok([batch], { page: 1, limit: 20, total: 1, totalPages: 1 }),
        'POST /batches/FT-Q/quarantine-release': (body) => {
          released = body;
          return ok({});
        },
      },
    });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /review and release FT-Q/i }));
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: /release batch/i }));
    expect(await within(dialog).findByText(/reason of at least 10 characters/i)).toBeInTheDocument();
    expect(released).toBeNull();
    await user.type(within(dialog).getByLabelText(/reason for release/i), 'Lab retest passed on 14 Oct');
    await user.click(within(dialog).getByRole('button', { name: /release batch/i }));
    await screen.findByText(/released from quarantine/i);
    expect(released).toEqual({ reason: 'Lab retest passed on 14 Oct' });
  });
});
