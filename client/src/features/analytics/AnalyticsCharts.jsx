import { useApi } from '../../hooks/useApi';
import * as analytics from '../../services/analyticsService';
import { ChartCard, BucketBar, CHART_COLORS, MultiLine, StatusPie } from '../../components/charts/Charts';
import { STATUS_COLORS } from '../../components/ui/Badges';
import { toBuckets, toRows } from '../../utils/normalize';

function ChartLoader({ loader, title, subtitle, children, isEmpty, emptyMessage, height }) {
  const { data, loading, error, reload } = useApi(loader, []);
  const empty = isEmpty(data);
  return (
    <ChartCard title={title} subtitle={subtitle} loading={loading} error={error} onRetry={reload} empty={!loading && !error && empty} emptyMessage={emptyMessage} height={height}>
      {!loading && !error && !empty && children(data)}
    </ChartCard>
  );
}

const bucketsEmpty = (d) => toBuckets(d).length === 0 || toBuckets(d).every((b) => b.value === 0);

/** Rows like [{date, a, b}] -> x key + numeric series keys. */
function seriesFromRows(data) {
  const rows = toRows(data);
  if (rows.length === 0) return { rows, xKey: 'label', keys: [] };
  const sample = rows[0];
  const xKey = ['date', 'day', 'period', 'label', 'week', 'month', 'bucket'].find((k) => k in sample) || Object.keys(sample)[0];
  const keys = Object.keys(sample).filter((k) => k !== xKey && rows.some((r) => typeof r[k] === 'number'));
  return { rows, xKey, keys };
}

/** All required analytics charts, each fed by its /analytics endpoint. Empty -> empty state, never fake data. */
export default function AnalyticsCharts({ compact = false }) {
  const h = 240;
  return (
    <div className="grid gap-4 lg:grid-cols-2" data-testid="analytics-charts">
      <ChartLoader title="Batch status distribution" loader={analytics.statusDistribution} isEmpty={bucketsEmpty} height={h}>
        {(d) => <StatusPie data={toBuckets(d)} />}
      </ChartLoader>

      <ChartLoader
        title="Quarantined and flagged batches"
        subtitle="Batches needing attention, from the status distribution"
        loader={analytics.statusDistribution}
        isEmpty={(d) => !toBuckets(d).some((b) => ['FLAGGED', 'QUARANTINED'].includes(b.label) && b.value > 0)}
        emptyMessage="No flagged or quarantined batches."
        height={h}
      >
        {(d) => (
          <BucketBar
            data={toBuckets(d).filter((b) => ['FLAGGED', 'QUARANTINED'].includes(b.label))}
            colorBy={(b) => STATUS_COLORS[b.label]}
          />
        )}
      </ChartLoader>

      <ChartLoader title="Freshness score distribution" subtitle="Batches by latest freshness score" loader={analytics.freshnessDistribution} isEmpty={bucketsEmpty} height={h}>
        {(d) => <BucketBar data={toBuckets(d)} color="#2f5545" />}
      </ChartLoader>

      <ChartLoader title="Remaining shelf-life distribution" loader={analytics.shelfLifeDistribution} isEmpty={bucketsEmpty} height={h}>
        {(d) => <BucketBar data={toBuckets(d)} color="#f08c0b" />}
      </ChartLoader>

      <ChartLoader title="Checkpoint activity" subtitle="Checkpoints recorded over time" loader={analytics.checkpointActivity} isEmpty={bucketsEmpty} height={h}>
        {(d) => <BucketBar data={toBuckets(d)} color="#5f8a76" />}
      </ChartLoader>

      <ChartLoader title="Batches per organisation" loader={analytics.orgBatchCounts} isEmpty={bucketsEmpty} height={h}>
        {(d) => <BucketBar data={toBuckets(d)} horizontal color="#26443a" />}
      </ChartLoader>

      {!compact && (
        <div className="lg:col-span-2">
          <ChartLoader
            title="Temperature and humidity excursion trend"
            subtitle="Readings outside the product's configured range"
            loader={analytics.excursions}
            isEmpty={(d) => {
              const s = seriesFromRows(d);
              if (s.rows.length) return s.keys.length === 0;
              return toBuckets(d).length === 0;
            }}
            emptyMessage="No excursions recorded."
            height={h}
          >
            {(d) => {
              const s = seriesFromRows(d);
              if (s.rows.length && s.keys.length) {
                const colors = [CHART_COLORS.temp, CHART_COLORS.humidity, ...CHART_COLORS.palette];
                return <MultiLine data={s.rows} xKey={s.xKey} lines={s.keys.map((k, i) => ({ key: k, color: colors[i % colors.length] }))} />;
              }
              return <BucketBar data={toBuckets(d)} color="#d46a06" />;
            }}
          </ChartLoader>
        </div>
      )}
    </div>
  );
}
