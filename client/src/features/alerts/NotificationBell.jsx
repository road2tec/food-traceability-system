import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, Check } from 'lucide-react';
import * as alertService from '../../services/alertService';
import { SeverityBadge } from '../../components/ui/Badges';
import { formatDate, titleCase } from '../../utils/format';
import { parseError } from '../../services/api';

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [alerts, setAlerts] = useState([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const ref = useRef(null);

  const load = useCallback(async () => {
    try {
      const { data, meta } = await alertService.listAlerts({ acknowledged: false, limit: 8, sort: '-createdAt' });
      const list = Array.isArray(data) ? data : [];
      setAlerts(list);
      setTotal(meta?.total ?? list.length);
      setError(null);
    } catch (e) {
      setError(parseError(e).message);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const ack = async (id) => {
    setBusyId(id);
    try {
      await alertService.acknowledgeAlert(id);
      setAlerts((a) => a.filter((x) => (x._id || x.id) !== id));
      setTotal((t) => Math.max(0, t - 1));
    } catch (e) {
      setError(parseError(e).message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        className="relative rounded-md p-2 text-ink-soft hover:bg-paper-100"
        aria-label={`Notifications, ${total} unacknowledged`}
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((o) => !o)}
      >
        <Bell className="h-5 w-5" aria-hidden="true" />
        {total > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-bold text-forest-950">
            {total > 99 ? '99+' : total}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-lg border border-paper-200 bg-white shadow-pop" role="region" aria-label="Notifications">
          <div className="flex items-center justify-between border-b border-paper-200 px-4 py-2.5">
            <h2 className="text-sm font-semibold">Alerts</h2>
            <Link to="/app/alerts" onClick={() => setOpen(false)} className="text-xs font-medium text-forest-600 hover:underline">
              View all
            </Link>
          </div>
          {error && <p role="alert" className="px-4 py-2 text-xs text-red-700">{error}</p>}
          {alerts.length === 0 && !error ? (
            <p className="px-4 py-6 text-center text-sm text-ink-soft">No unacknowledged alerts.</p>
          ) : (
            <ul className="max-h-80 divide-y divide-paper-200 overflow-y-auto">
              {alerts.map((a) => {
                const id = a._id || a.id;
                return (
                  <li key={id} className="flex items-start gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <SeverityBadge severity={a.severity} />
                        <span className="truncate text-xs text-ink-muted">{titleCase(a.type)}</span>
                      </div>
                      <p className="mt-1 text-sm text-ink">{a.message}</p>
                      <p className="mt-0.5 text-xs text-ink-muted">
                        {a.batchId && (
                          <Link to={`/app/batches/${a.batchId}`} className="text-forest-600 hover:underline" onClick={() => setOpen(false)}>
                            {a.batchId}
                          </Link>
                        )}{' '}
                        {formatDate(a.createdAt)}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="btn-secondary px-2 py-1 text-xs"
                      onClick={() => ack(id)}
                      disabled={busyId === id}
                      aria-label={`Acknowledge alert: ${a.message}`}
                    >
                      <Check className="h-3.5 w-3.5" aria-hidden="true" /> Ack
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
