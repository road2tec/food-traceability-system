import { describe, expect, it } from 'vitest';
import { toBuckets, toSeries } from '../utils/normalize';
import { extractBatchId } from '../pages/public/ScanPage';
import { batchesToCsv } from '../pages/batches/BatchesPage';
import { checkpointSchema, batchSchema } from '../utils/schemas';
import { parseError, unwrap } from '../services/api';

describe('normalizers', () => {
  it('accepts arrays, maps and wrapped arrays; returns [] for nothing', () => {
    expect(toBuckets([{ status: 'SAFE', count: 3 }])).toEqual([{ label: 'SAFE', value: 3 }]);
    expect(toBuckets({ SAFE: 2, FLAGGED: 1 })).toEqual([{ label: 'SAFE', value: 2 }, { label: 'FLAGGED', value: 1 }]);
    expect(toBuckets({ buckets: [{ range: '0-20', count: 4 }] })).toEqual([{ label: '0-20', value: 4 }]);
    expect(toBuckets(null)).toEqual([]);
    expect(toBuckets([])).toEqual([]);
  });
  it('sorts series by time', () => {
    const s = toSeries([{ timestamp: '2026-01-02T00:00:00Z', temperatureC: 5 }, { timestamp: '2026-01-01T00:00:00Z', temperatureC: 4 }]);
    expect(s.map((r) => r.temperatureC)).toEqual([4, 5]);
  });
});

describe('scan parsing', () => {
  it('extracts a batch id from a URL or raw text', () => {
    expect(extractBatchId('http://localhost:5173/verify/FT-20261001-AAA111')).toBe('FT-20261001-AAA111');
    expect(extractBatchId('FT-20261001-AAA111')).toBe('FT-20261001-AAA111');
    expect(extractBatchId('hello world!')).toBeNull();
    expect(extractBatchId('')).toBeNull();
  });
});

describe('csv export', () => {
  it('escapes quotes', () => {
    const csv = batchesToCsv([{ batchId: 'FT-1', productName: 'Say "hi"', status: 'SAFE' }]);
    expect(csv.split('\n')[1]).toContain('"Say ""hi"""');
  });
});

describe('schemas', () => {
  it('batch schema rejects expiry before production', () => {
    const r = batchSchema.safeParse({
      productName: 'Milk', productType: 'x', quantity: '5', unit: 'litre', origin: 'Farm', harvestDate: '2026-10-05',
      expiryDate: '2026-10-01', refTempC: '', refHumidityPct: '', internalNotes: '',
    });
    expect(r.success).toBe(false);
  });
  it('checkpoint schema accepts a valid reading', () => {
    const r = checkpointSchema.safeParse({
      batchId: 'FT-1', eventType: 'STORAGE', temperatureC: '4', humidityPct: '80', location: 'Dock', eventTimestamp: '2026-01-01T10:00', remarks: '',
    });
    expect(r.success).toBe(true);
  });
});

describe('api helpers', () => {
  it('unwraps the envelope and parses errors', () => {
    expect(unwrap({ data: { success: true, data: [1], meta: { total: 1 } } })).toEqual({ data: [1], meta: { total: 1 } });
    const e = parseError({ response: { status: 403, data: { success: false, error: { code: 'FORBIDDEN', message: 'No' } } } });
    expect(e).toMatchObject({ code: 'FORBIDDEN', message: 'No', status: 403 });
    expect(parseError({ code: 'ERR_NETWORK' }).code).toBe('NETWORK');
  });
});
