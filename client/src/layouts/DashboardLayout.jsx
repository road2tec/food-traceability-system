import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ICONS as Icons } from '../utils/icons';
import { Leaf, LogOut, Menu, QrCode, X } from 'lucide-react';
import { useAuth } from '../features/auth/AuthContext';
import NotificationBell from '../features/alerts/NotificationBell';
import { navForRole } from '../utils/constants';
import { ROLE_LABELS } from '../utils/constants';
import { orgName } from '../utils/format';

function NavItems({ items, onNavigate }) {
  return (
    <nav aria-label="Main" className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
      {items.map((item) => {
        const Icon = Icons[item.icon] || Icons.Circle;
        return (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={onNavigate}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                isActive ? 'bg-forest-700 text-white' : 'text-forest-100 hover:bg-forest-800 hover:text-white'
              }`
            }
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
            {item.label}
          </NavLink>
        );
      })}
    </nav>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-2 px-5 py-4 text-white">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500 text-forest-950">
        <Leaf className="h-4 w-4" aria-hidden="true" />
      </span>
      <span className="text-lg font-semibold tracking-tight">FreshChain</span>
    </div>
  );
}

export default function DashboardLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const items = navForRole(user?.role);

  useEffect(() => setMobileOpen(false), [location.pathname]);
  useEffect(() => {
    if (!mobileOpen) return undefined;
    const onKey = (e) => e.key === 'Escape' && setMobileOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [mobileOpen]);

  const doLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  const sidebar = (
    <div className="flex h-full flex-col bg-forest-900">
      <Brand />
      <NavItems items={items} onNavigate={() => setMobileOpen(false)} />
      <div className="border-t border-forest-800 p-3">
        <NavLink to="/scan" className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-forest-100 hover:bg-forest-800">
          <QrCode className="h-4 w-4" aria-hidden="true" /> Public QR scanner
        </NavLink>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-paper lg:pl-64">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2">
        Skip to content
      </a>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 lg:block" aria-label="Sidebar">
        {sidebar}
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation menu">
          <div className="absolute inset-0 bg-forest-950/50" onClick={() => setMobileOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-72 max-w-[85vw] shadow-pop">
            <button type="button" className="absolute right-2 top-3 z-10 rounded p-1.5 text-forest-100 hover:bg-forest-800" onClick={() => setMobileOpen(false)} aria-label="Close menu">
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
            {sidebar}
          </div>
        </div>
      )}

      <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-paper-200 bg-white/95 px-4 backdrop-blur sm:px-6">
        <button type="button" className="rounded-md p-2 text-ink-soft hover:bg-paper-100 lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open menu" aria-expanded={mobileOpen}>
          <Menu className="h-5 w-5" aria-hidden="true" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-ink">{orgName(user?.organisation)}</p>
          <p className="truncate text-xs text-ink-muted">{ROLE_LABELS[user?.role] || user?.role}</p>
        </div>
        <NotificationBell />
        <div className="hidden text-right sm:block">
          <p className="text-sm font-medium leading-tight">{user?.name}</p>
          <p className="text-xs text-ink-muted">{user?.email}</p>
        </div>
        <button type="button" className="btn-secondary" onClick={doLogout}>
          <LogOut className="h-4 w-4" aria-hidden="true" /> <span className="hidden sm:inline">Sign out</span>
          <span className="sr-only sm:hidden">Sign out</span>
        </button>
      </header>

      <main id="main" className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <Outlet />
      </main>
    </div>
  );
}
