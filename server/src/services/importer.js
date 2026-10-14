'use strict';
const { parse } = require('csv-parse/sync');
const { E } = require('../utils/AppError');
const { validateRecord, latestTimestamp } = require('./checkpoints');

const MAX_ROWS = 5000;

// Accept snake_case (CSV) and camelCase keys.
const pick = (o, ...keys) => { for (const k of keys) if (o[k] !== undefined) return o[k]; return undefined; };
const mapRow = (o) => ({
  eventTimestamp: pick(o, 'timestamp', 'eventTimestamp'),
  temperatureC: pick(o, 'temperature_c', 'temperatureC'),
  humidityPct: pick(o, 'humidity_pct', 'humidityPct'),
  location: pick(o, 'location'),
  eventType: pick(o, 'event_type', 'eventType'),
  remarks: pick(o, 'remarks'),
});

function parseFile(file) {
  const isJson = /\.json$/i.test(file.originalname);
  const text = file.buffer.toString('utf8');
  let rows;
  try {
    if (isJson) {
      rows = JSON.parse(text);
      if (!Array.isArray(rows)) throw new Error('JSON must be an array of records');
      if (rows.some((r) => r === null || typeof r !== 'object' || Array.isArray(r))) {
        rows = rows.map((r) => (r && typeof r === 'object' && !Array.isArray(r) ? r : { __invalid: true }));
      }
    } else {
      rows = parse(text, { columns: true, skip_empty_lines: true, bom: true, trim: true, relax_column_count: true });
    }
  } catch (e) {
    throw E.validation(`Could not parse ${isJson ? 'JSON' : 'CSV'} file: ${e.message}`);
  }
  if (!rows.length) throw E.validation('File contains no records');
  if (rows.length > MAX_ROWS) throw E.validation(`File has ${rows.length} rows; maximum is ${MAX_ROWS}`);
  return { sourceType: isJson ? 'JSON_IMPORT' : 'CSV_IMPORT', rows, firstRowNumber: isJson ? 1 : 2 };
}

/**
 * Validate every row (nothing is dropped silently). Rows are checked in timestamp order for
 * chronology/duplicates against existing data. Returns rows in ORIGINAL order with errors[] each.
 */
async function validateRows({ batch, orgId, rows, firstRowNumber }) {
  const base = await latestTimestamp(batch.batchId);
  const out = rows.map((r, i) => ({ row: i + firstRowNumber, raw: r, idx: i }));
  const seen = new Set();
  const order = out.map((o) => ({ o, t: new Date(o.raw && (o.raw.timestamp || o.raw.eventTimestamp)).getTime() }))
    .sort((a, b) => (Number.isNaN(a.t) ? Infinity : a.t) - (Number.isNaN(b.t) ? Infinity : b.t) || a.o.idx - b.o.idx);
  const result = new Array(out.length);
  for (const { o } of order) {
    if (o.raw && o.raw.__invalid) { result[o.idx] = { row: o.row, errors: ['row is not an object'] }; continue; }
    const { record, errors } = validateRecord(mapRow(o.raw), { batch, orgId, lastTs: base, seenKeys: seen });
    result[o.idx] = { row: o.row, errors, record: errors.length ? undefined : serialiseRecord(record) };
  }
  return result;
}

const serialiseRecord = (r) => ({ eventType: r.eventType, temperatureC: r.temperatureC, humidityPct: r.humidityPct, location: r.location, eventTimestamp: r.eventTimestamp.toISOString(), remarks: r.remarks });

module.exports = { parseFile, validateRows, mapRow, MAX_ROWS };
