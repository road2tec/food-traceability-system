import { Link, useParams } from 'react-router-dom';
import { Award, ScanLine, ShieldAlert, ShieldCheck } from 'lucide-react';
import { useApi } from '../../hooks/useApi';
import * as publicService from '../../services/publicService';
import { StatusBadge } from '../../components/ui/Badges';
import { Alert, EmptyState, ErrorState, Skeleton } from '../../components/ui/States';
import { ChartCard, CHART_COLORS, SeriesLine } from '../../components/charts/Charts';
import Timeline from '../../components/domain/Timeline';
import FreshnessPanel from '../../components/domain/FreshnessPanel';
import { DefList } from '../../components/ui/Cards';
import { DISCLAIMER } from '../../utils/constants';
import { formatDate, formatNumber, titleCase } from '../../utils/format';
import { toSeries } from '../../utils/normalize';

function integrityTone(overall) {
  const o = String(overall || '').toUpperCase();
  if (/MISMATCH|FAIL|TAMPER|INVALID/.test(o)) return 'bad';
  if (/PENDING|PARTIAL|UNVERIFIED|UNAVAILABLE|UNKNOWN|NOT/.test(o)) return 'warn';
  if (/VERIFIED|PASS|MATCH|VALID|OK|INTACT/.test(o)) return 'good';
  return 'neutral';
}

export function IntegrityPanel({ integrity, timeline = [] }) {
  if (!integrity) return <p className="text-sm text-ink-soft">No integrity check has been recorded for this batch.</p>;
  const tone = integrityTone(integrity.overall);
  const styles = {
    good: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    warn: 'border-amber-300 bg-amber-50 text-amber-900',
    bad: 'border-red-200 bg-red-50 text-red-900',
    neutral: 'border-paper-300 bg-paper-100 text-ink',
  };
  const Icon = tone === 'good' ? ShieldCheck : ShieldAlert;
  const details = integrity.details;
  return (
    <div>
      <div className={`flex items-start gap-3 rounded-md border px-4 py-3 ${styles[tone]}`} data-testid="integrity-result">
        <Icon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
        <div>
          <p className="font-semibold">Integrity result: {titleCase(integrity.overall) || 'Unknown'}</p>
          <p className="text-xs opacity-80">Checked {formatDate(integrity.checkedAt)}</p>
        </div>
      </div>
      {details && (
        <div className="mt-3 text-sm text-ink-soft">
          {typeof details === 'string' ? (
            <p>{details}</p>
          ) : Array.isArray(details) ? (
            <ul className="list-disc pl-5">{details.map((d, i) => <li key={i}>{typeof d === 'string' ? d : JSON.stringify(d)}</li>)}</ul>
          ) : (
            <ul className="list-disc pl-5">
              {Object.entries(details).map(([k, v]) => (
                <li key={k}>{titleCase(k)}: {typeof v === 'object' ? JSON.stringify(v) : String(v)}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      <p className="mt-3 text-xs text-ink-muted">
        The check recomputes each record's SHA-256 hash and compares it with the hash stored when it was recorded. A match shows the data is unchanged; it does not prove the original reading was truthful.
      </p>
    </div>
  );
}

function Loading() {
  return (
    <div role="status" aria-label="Loading batch verification" className="space-y-4">
      <Skeleton className="h-24 w-full" />
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    </div>
  );
}

export default function VerifyPage() {
  const { batchId } = useParams();
  const { data, loading, error, reload } = useApi(() => publicService.verifyPublic(batchId), [batchId]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Product verification</h1>
        <Link to="/scan" className="btn-secondary"><ScanLine className="h-4 w-4" aria-hidden="true" /> Scan another</Link>
      </div>

      {loading ? (
        <Loading />
      ) : error ? (
        error.status === 404 || error.code === 'NOT_FOUND' ? (
          <div className="card"><EmptyState title="Batch not found" message={`No batch with ID "${batchId}" exists. Check the code on the package and try again.`} action={<Link to="/scan" className="btn-primary">Try another code</Link>} /></div>
        ) : (
          <div className="card"><ErrorState error={error} onRetry={reload} title="Could not load verification data" /></div>
        )
      ) : (
        <VerifyContent data={data} />
      )}
    </div>
  );
}

function VerifyContent({ data }) {
  const batch = data?.batch || {};
  const timeline = data?.timeline || [];
  const series = toSeries(timeline);
  const hasTemp = series.some((s) => s.temperatureC !== null);
  const hasHum = series.some((s) => s.humidityPct !== null);
  const quarantined = batch.status === 'QUARANTINED';

  return (
    <div className="space-y-5">
      <section className="card p-5" aria-label="Product">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">{batch.productName || 'Unknown product'}</h2>
            <p className="mt-0.5 font-mono text-xs text-ink-muted">{batch.batchId}</p>
          </div>
          <StatusBadge status={batch.status} />
        </div>
        {quarantined && (
          <Alert tone="error" className="mt-4">
            This batch is quarantined and is not cleared for sale. Do not consume it based on this page; contact the retailer or producer.
          </Alert>
        )}
        <div className="mt-4">
          <DefList
            items={[
              ['Category', titleCase(batch.category)],
              ['Origin', batch.origin],
              ['Produced', formatDate(batch.producedAt, false)],
              ['Quantity', batch.quantity !== undefined ? `${formatNumber(batch.quantity, 2)} ${batch.unit || ''}` : '—'],
              ['Lifecycle', titleCase(batch.lifecycle)],
              ['Last updated', formatDate(batch.lastUpdated)],
            ]}
          />
        </div>
      </section>

      <div className="grid gap-5 md:grid-cols-2">
        <section className="card p-5" aria-label="Freshness estimate">
          <h2 className="mb-4 text-sm font-semibold">Freshness estimate</h2>
          <FreshnessPanel freshness={data?.freshness} />
        </section>
        <section className="card p-5" aria-label="Data integrity">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold"><ShieldCheck className="h-4 w-4" aria-hidden="true" /> Data integrity</h2>
          <IntegrityPanel integrity={data?.integrity} timeline={timeline} />
        </section>
      </div>

      <section className="card p-5" aria-label="Journey">
        <h2 className="mb-4 text-sm font-semibold">Journey timeline</h2>
        <Timeline events={timeline} />
      </section>

      <div className="grid gap-5 md:grid-cols-2">
        <ChartCard title="Temperature history" empty={!hasTemp} emptyMessage="No temperature readings recorded." height={220}>
          <SeriesLine data={series} dataKey="temperatureC" name="Temperature" color={CHART_COLORS.temp} unit=" °C" />
        </ChartCard>
        <ChartCard title="Humidity history" empty={!hasHum} emptyMessage="No humidity readings recorded." height={220}>
          <SeriesLine data={series} dataKey="humidityPct" name="Humidity" color={CHART_COLORS.humidity} unit="%" />
        </ChartCard>
      </div>

      <section className="card p-5" aria-label="Certificates">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold"><Award className="h-4 w-4" aria-hidden="true" /> Certificates</h2>
        {data?.certificates?.length ? (
          <ul className="divide-y divide-paper-200 text-sm">
            {data.certificates.map((c, i) => (
              <li key={c.id || c._id || i} className="py-2">{c.filename || c.name || 'Certificate'}{c.mimeType ? <span className="text-ink-muted"> ({c.mimeType})</span> : null}</li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ink-soft">No approved certificates are attached to this batch.</p>
        )}
      </section>

      <Alert tone="warn">{data?.disclaimer || DISCLAIMER}</Alert>
    </div>
  );
}
