import { MapPin, Droplets, Thermometer } from 'lucide-react';
import { EmptyState } from '../ui/States';
import { formatDate, titleCase } from '../../utils/format';

/** Vertical timeline. Works for public timeline entries and authenticated checkpoints. */
export default function Timeline({ events }) {
  if (!events || events.length === 0) {
    return <EmptyState title="No events recorded yet" message="Checkpoints will appear here as the batch moves through the supply chain." />;
  }
  return (
    <ol className="relative space-y-5 border-l-2 border-paper-200 pl-6" aria-label="Batch timeline">
      {events.map((e, i) => {
        const when = e.timestamp || e.eventTimestamp;
        const org = typeof e.organisation === 'object' ? e.organisation?.publicName || e.organisation?.name : e.organisation;
        return (
          <li key={e.checkpointId || e.txId || `${when}-${i}`} className="relative">
            <span className="absolute -left-[1.85rem] top-1 h-3 w-3 rounded-full border-2 border-white bg-forest-600 ring-2 ring-forest-200" aria-hidden="true" />
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <p className="text-sm font-semibold">{titleCase(e.eventType)}</p>
              <time className="text-xs text-ink-muted" dateTime={when}>{formatDate(when)}</time>
            </div>
            <p className="mt-0.5 text-sm text-ink-soft">{org || 'Unknown organisation'}</p>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-soft">
              {e.location && <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" aria-hidden="true" />{e.location}</span>}
              {e.temperatureC !== undefined && e.temperatureC !== null && <span className="inline-flex items-center gap-1"><Thermometer className="h-3.5 w-3.5" aria-hidden="true" />{e.temperatureC} °C</span>}
              {e.humidityPct !== undefined && e.humidityPct !== null && <span className="inline-flex items-center gap-1"><Droplets className="h-3.5 w-3.5" aria-hidden="true" />{e.humidityPct}% RH</span>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
