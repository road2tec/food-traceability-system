import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { BarChart3 } from 'lucide-react';
import { EmptyState, ErrorState, Skeleton } from '../ui/States';
import { STATUS_COLORS } from '../ui/Badges';

const AXIS = { fontSize: 12, fill: '#6b7872' };
const PALETTE = ['#2f5545', '#f08c0b', '#5f8a76', '#d46a06', '#8fb0a1', '#af4b09'];

export function ChartCard({ title, subtitle, loading, error, onRetry, empty, emptyMessage, children, height = 260 }) {
  return (
    <section className="card p-4" aria-label={title}>
      <h3 className="text-sm font-semibold">{title}</h3>
      {subtitle && <p className="mt-0.5 text-xs text-ink-muted">{subtitle}</p>}
      <div className="mt-3" style={{ minHeight: height }}>
        {loading ? (
          <Skeleton className="w-full" style={{ height }} />
        ) : error ? (
          <ErrorState error={error} onRetry={onRetry} title="Chart unavailable" />
        ) : empty ? (
          <EmptyState icon={BarChart3} title="No data yet" message={emptyMessage || 'This chart fills in as batches and checkpoints are recorded.'} />
        ) : (
          <div style={{ width: '100%', height }}>{children}</div>
        )}
      </div>
    </section>
  );
}

export function BucketBar({ data, color = '#2f5545', colorBy, horizontal = false, unit }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout={horizontal ? 'vertical' : 'horizontal'} margin={{ top: 4, right: 8, left: horizontal ? 24 : -16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#ebe6db" vertical={!horizontal} horizontal={horizontal ? false : true} />
        {horizontal ? (
          <>
            <XAxis type="number" tick={AXIS} allowDecimals={false} />
            <YAxis type="category" dataKey="label" tick={AXIS} width={110} />
          </>
        ) : (
          <>
            <XAxis dataKey="label" tick={AXIS} interval="preserveStartEnd" />
            <YAxis tick={AXIS} allowDecimals={false} />
          </>
        )}
        <Tooltip formatter={(v) => [unit ? `${v} ${unit}` : v, 'Count']} />
        <Bar dataKey="value" fill={color} radius={[3, 3, 0, 0]}>
          {colorBy && data.map((d, i) => <Cell key={i} fill={colorBy(d, i)} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function StatusPie({ data }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="label" innerRadius={55} outerRadius={90} paddingAngle={2}>
          {data.map((d, i) => (
            <Cell key={d.label} fill={STATUS_COLORS[d.label] || PALETTE[i % PALETTE.length]} />
          ))}
        </Pie>
        <Tooltip />
        <Legend verticalAlign="bottom" height={28} />
      </PieChart>
    </ResponsiveContainer>
  );
}

/** Multi-series line chart over rows; `lines` = [{key,name,color}]. */
export function MultiLine({ data, xKey, lines, unit }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#ebe6db" />
        <XAxis dataKey={xKey} tick={AXIS} interval="preserveStartEnd" />
        <YAxis tick={AXIS} unit={unit} allowDecimals={false} />
        <Tooltip />
        {lines.length > 1 && <Legend />}
        {lines.map((l) => (
          <Line key={l.key} type="monotone" dataKey={l.key} name={l.name || l.key} stroke={l.color} strokeWidth={2} dot={data.length < 25} connectNulls />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

/** Temperature / humidity history for one batch, optionally with a reference band. */
export function SeriesLine({ data, dataKey, name, color, unit, band }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#ebe6db" />
        <XAxis dataKey="label" tick={AXIS} interval="preserveStartEnd" />
        <YAxis tick={AXIS} unit={unit} domain={['auto', 'auto']} />
        <Tooltip formatter={(v) => [`${v}${unit || ''}`, name]} />
        {band && Number.isFinite(band.min) && Number.isFinite(band.max) && (
          <ReferenceArea y1={band.min} y2={band.max} fill="#2f855a" fillOpacity={0.08} />
        )}
        <Line type="monotone" dataKey={dataKey} name={name} stroke={color} strokeWidth={2} dot={data.length < 40} connectNulls />
      </LineChart>
    </ResponsiveContainer>
  );
}

export const CHART_COLORS = { temp: '#d46a06', humidity: '#2f5545', palette: PALETTE };
