/**
 * The contract defines endpoints for /analytics/* but not their payload shapes.
 * These helpers accept the plausible shapes (array of rows, object map, or object
 * wrapping an array) and always return rows suitable for charts. If the backend
 * returns nothing, the result is an empty array so the UI can show an empty state.
 */

function firstArray(data) {
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object') {
    for (const v of Object.values(data)) if (Array.isArray(v)) return v;
  }
  return null;
}

const LABEL_KEYS = ['label', 'name', 'status', 'bucket', 'range', 'date', 'day', 'period', 'organisation', 'organisationName', 'org', 'batchId', '_id', 'key'];
const VALUE_KEYS = ['value', 'count', 'total', 'batches', 'custodyBatches', 'excursions', 'n'];

function pickKey(row, keys) {
  return keys.find((k) => row[k] !== undefined && row[k] !== null);
}

/** -> [{label, value}] */
export function toBuckets(data) {
  if (!data) return [];
  const arr = firstArray(data);
  if (arr) {
    return arr
      .map((row) => {
        if (row === null || typeof row !== 'object') return null;
        const lk = pickKey(row, LABEL_KEYS);
        const vk = pickKey(row, VALUE_KEYS);
        if (!lk || !vk) return null;
        const label = typeof row[lk] === 'object' ? row[lk].name || row[lk].publicName || String(row[lk]._id) : String(row[lk]);
        return { label, value: Number(row[vk]) || 0 };
      })
      .filter(Boolean);
  }
  if (typeof data === 'object') {
    return Object.entries(data)
      .filter(([, v]) => typeof v === 'number')
      .map(([label, value]) => ({ label, value }));
  }
  return [];
}

/** Multi-series rows e.g. excursions [{date, temperature, humidity}] -> keeps numeric fields. */
export function toRows(data) {
  const arr = firstArray(data);
  if (!arr) return [];
  return arr.filter((r) => r && typeof r === 'object');
}

export function hasData(rows) {
  return Array.isArray(rows) && rows.length > 0;
}

export function pick(obj, ...keys) {
  if (!obj) return undefined;
  for (const k of keys) {
    const parts = k.split('.');
    let cur = obj;
    for (const p of parts) cur = cur?.[p];
    if (cur !== undefined && cur !== null) return cur;
  }
  return undefined;
}

/** Normalises a per-batch series into [{t, label, temperatureC, humidityPct}] sorted by time. */
export function toSeries(data) {
  const arr = firstArray(data) || [];
  return arr
    .map((r) => {
      const ts = r.timestamp || r.eventTimestamp || r.t || r.time;
      const t = ts ? new Date(ts).getTime() : NaN;
      return {
        t,
        label: ts ? new Date(ts).toLocaleString(undefined, { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '',
        temperatureC: numOrNull(r.temperatureC ?? r.temperature ?? r.temp),
        humidityPct: numOrNull(r.humidityPct ?? r.humidity),
        score: numOrNull(r.score ?? r.freshnessScore),
      };
    })
    .filter((r) => !Number.isNaN(r.t))
    .sort((a, b) => a.t - b.t);
}

function numOrNull(v) {
  return v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v);
}

/** Unwrap a list payload that might be `[...]` or `{items:[...]}`. */
export function asList(data) {
  return firstArray(data) || [];
}
