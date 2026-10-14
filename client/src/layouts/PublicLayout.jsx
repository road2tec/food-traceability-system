import { useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { Leaf, Menu, X } from 'lucide-react';
import { useAuth } from '../features/auth/AuthContext';

export function PublicHeader() {
  const { isAuthenticated } = useAuth();
  const [open, setOpen] = useState(false);
  const link = ({ isActive }) => `text-sm font-medium ${isActive ? 'text-white' : 'text-forest-200 hover:text-white'}`;
  return (
    <header className="sticky top-0 z-30 bg-forest-900">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link to="/" className="flex items-center gap-2 text-white">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500 text-forest-950">
            <Leaf className="h-4 w-4" aria-hidden="true" />
          </span>
          <span className="text-lg font-semibold tracking-tight">FreshChain</span>
        </Link>
        <nav aria-label="Primary" className="hidden items-center gap-6 md:flex">
          <a href="/#how-it-works" className="text-sm font-medium text-forest-200 hover:text-white">How it works</a>
          <a href="/#integrity" className="text-sm font-medium text-forest-200 hover:text-white">Data integrity</a>
          <a href="/#security" className="text-sm font-medium text-forest-200 hover:text-white">Security</a>
          <NavLink to="/scan" className={link}>Scan a QR</NavLink>
          {isAuthenticated ? (
            <Link to="/app" className="btn-accent">Open dashboard</Link>
          ) : (
            <>
              <NavLink to="/login" className={link}>Sign in</NavLink>
              <Link to="/register" className="btn-accent">Register</Link>
            </>
          )}
        </nav>
        <button type="button" className="rounded p-2 text-white md:hidden" aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {open ? <X className="h-5 w-5" aria-hidden="true" /> : <Menu className="h-5 w-5" aria-hidden="true" />}
        </button>
      </div>
      {open && (
        <nav aria-label="Mobile" className="space-y-1 border-t border-forest-800 px-4 pb-4 pt-2 md:hidden">
          {[
            ['/#how-it-works', 'How it works'],
            ['/#integrity', 'Data integrity'],
            ['/#security', 'Security'],
          ].map(([href, label]) => (
            <a key={href} href={href} onClick={() => setOpen(false)} className="block rounded px-2 py-2 text-sm text-forest-100 hover:bg-forest-800">{label}</a>
          ))}
          <Link to="/scan" onClick={() => setOpen(false)} className="block rounded px-2 py-2 text-sm text-forest-100 hover:bg-forest-800">Scan a QR</Link>
          {isAuthenticated ? (
            <Link to="/app" onClick={() => setOpen(false)} className="block rounded px-2 py-2 text-sm text-amber-300">Open dashboard</Link>
          ) : (
            <>
              <Link to="/login" onClick={() => setOpen(false)} className="block rounded px-2 py-2 text-sm text-forest-100 hover:bg-forest-800">Sign in</Link>
              <Link to="/register" onClick={() => setOpen(false)} className="block rounded px-2 py-2 text-sm text-amber-300">Register</Link>
            </>
          )}
        </nav>
      )}
    </header>
  );
}

export function PublicFooter() {
  return (
    <footer className="bg-forest-950 text-forest-200">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:grid-cols-3 sm:px-6">
        <div>
          <div className="flex items-center gap-2 text-white">
            <Leaf className="h-4 w-4 text-amber-400" aria-hidden="true" />
            <span className="font-semibold">FreshChain</span>
          </div>
          <p className="mt-3 text-sm text-forest-300">
            Food traceability and freshness estimation with tamper-evident records. A software demonstration system.
          </p>
        </div>
        <div>
          <h2 className="text-sm font-semibold text-white">Explore</h2>
          <ul className="mt-3 space-y-2 text-sm">
            <li><Link to="/scan" className="hover:text-white">Scan a product QR</Link></li>
            <li><a href="/#how-it-works" className="hover:text-white">How it works</a></li>
            <li><a href="/#security" className="hover:text-white">Security and limitations</a></li>
          </ul>
        </div>
        <div>
          <h2 className="text-sm font-semibold text-white">Participants</h2>
          <ul className="mt-3 space-y-2 text-sm">
            <li><Link to="/login" className="hover:text-white">Sign in</Link></li>
            <li><Link to="/register" className="hover:text-white">Request an account</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-forest-800 px-4 py-4 text-center text-xs text-forest-300">
        Freshness values are estimates for demonstration and are not proof of food safety.
      </div>
    </footer>
  );
}

export default function PublicLayout() {
  return (
    <div className="flex min-h-screen flex-col">
      <PublicHeader />
      <main className="flex-1">
        <Outlet />
      </main>
      <PublicFooter />
    </div>
  );
}
