export const ROLES = ['ADMIN', 'PRODUCER', 'DISTRIBUTOR', 'WAREHOUSE', 'RETAILER'];
export const REGISTRATION_ROLES = ['PRODUCER', 'DISTRIBUTOR', 'WAREHOUSE', 'RETAILER'];
export const ORG_TYPES = ['PRODUCER', 'DISTRIBUTOR', 'WAREHOUSE', 'RETAILER'];
export const USER_STATUSES = ['PENDING', 'ACTIVE', 'REJECTED', 'SUSPENDED'];
export const BATCH_STATUSES = ['SAFE', 'FLAGGED', 'QUARANTINED', 'PENDING_REVIEW'];
export const LIFECYCLES = ['REGISTERED', 'IN_TRANSIT', 'IN_STORAGE', 'AT_RETAIL', 'SOLD', 'WITHDRAWN'];
export const EVENT_TYPES = ['PRODUCTION', 'STORAGE', 'DISPATCH', 'TRANSIT', 'ARRIVAL', 'RECEIPT', 'INSPECTION', 'SALE'];
export const TRANSFER_STATES = ['PROPOSED', 'ACCEPTED', 'REJECTED', 'CANCELLED'];
export const SEVERITIES = ['INFO', 'WARNING', 'CRITICAL'];
export const CATEGORIES = ['FRUIT', 'VEGETABLE', 'DAIRY'];
export const SIM_SCENARIOS = [
  'NORMAL',
  'TEMP_EXCURSION',
  'COOLING_FAILURE',
  'TRANSPORT_DELAY',
  'VARIABLE_HUMIDITY',
  'MULTI_HANDOVER',
  'MISSING_READINGS',
  'INVALID_READINGS',
];

export const ROLE_LABELS = {
  ADMIN: 'Administrator',
  PRODUCER: 'Producer',
  DISTRIBUTOR: 'Distributor',
  WAREHOUSE: 'Warehouse',
  RETAILER: 'Retailer',
};

export const HANDLER_ROLES = ['DISTRIBUTOR', 'WAREHOUSE', 'RETAILER'];

export const DISCLAIMER =
  'Freshness scores and remaining shelf-life values are model estimates for demonstration. They are not proof that food is safe or unsafe to eat. Always follow official food-safety guidance.';

/** Sidebar navigation per role. `to` paths are all real routes. */
export const NAV_BY_ROLE = {
  ADMIN: [
    { to: '/app', label: 'Overview', icon: 'LayoutDashboard', end: true },
    { to: '/app/batches', label: 'All batches', icon: 'Package' },
    { to: '/app/analytics', label: 'Analytics', icon: 'BarChart3' },
    { to: '/app/admin/users', label: 'Users & approvals', icon: 'Users' },
    { to: '/app/admin/organisations', label: 'Organisations', icon: 'Building2' },
    { to: '/app/admin/product-types', label: 'Product types', icon: 'Apple' },
    { to: '/app/admin/quarantine', label: 'Quarantine review', icon: 'ShieldAlert' },
    { to: '/app/admin/audit', label: 'Audit logs', icon: 'ScrollText' },
    { to: '/app/admin/models', label: 'Model versions', icon: 'Cpu' },
    { to: '/app/admin/reports', label: 'Reports', icon: 'FileDown' },
    { to: '/app/alerts', label: 'Alerts', icon: 'Bell' },
  ],
  PRODUCER: [
    { to: '/app', label: 'Overview', icon: 'LayoutDashboard', end: true },
    { to: '/app/batches', label: 'My batches', icon: 'Package' },
    { to: '/app/batches/new', label: 'Register batch', icon: 'PlusCircle' },
    { to: '/app/transfers', label: 'Transfers', icon: 'ArrowRightLeft' },
    { to: '/app/analytics', label: 'Analytics', icon: 'BarChart3' },
    { to: '/app/alerts', label: 'Alerts', icon: 'Bell' },
  ],
  HANDLER: [
    { to: '/app', label: 'Overview', icon: 'LayoutDashboard', end: true },
    { to: '/app/transfers', label: 'Incoming transfers', icon: 'ArrowRightLeft' },
    { to: '/app/batches', label: 'Batches in custody', icon: 'Package' },
    { to: '/app/checkpoints/new', label: 'Record checkpoint', icon: 'ClipboardPlus' },
    { to: '/app/imports', label: 'CSV / JSON upload', icon: 'Upload' },
    { to: '/app/analytics', label: 'Analytics & reports', icon: 'BarChart3' },
    { to: '/app/alerts', label: 'Alerts', icon: 'Bell' },
  ],
};

export function navForRole(role) {
  if (role === 'ADMIN' || role === 'PRODUCER') return NAV_BY_ROLE[role];
  return NAV_BY_ROLE.HANDLER;
}
