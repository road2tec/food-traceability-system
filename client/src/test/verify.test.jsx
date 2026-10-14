import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import { apiError, ok, renderApp } from './utils';

const PUBLIC = {
  batch: {
    batchId: 'FT-20261001-AAA111', productName: 'Organic Bananas', category: 'FRUIT', origin: 'Ecuador',
    producedAt: '2026-10-01T00:00:00Z', quantity: 250, unit: 'kg', status: 'FLAGGED', lifecycle: 'AT_RETAIL', lastUpdated: '2026-10-12T10:00:00Z',
  },
  timeline: [
    { eventType: 'PRODUCTION', organisation: 'Green Farms', location: 'Guayas', timestamp: '2026-10-01T06:00:00Z', temperatureC: 14, humidityPct: 85 },
    { eventType: 'TRANSIT', organisation: 'FastFreight', location: 'Port', timestamp: '2026-10-03T06:00:00Z', temperatureC: 16, humidityPct: 80 },
  ],
  freshness: {
    score: 52, remainingShelfLifeHours: 96, riskCategory: 'MODERATE', modelVersion: 'arrhenius-1',
    predictedAt: '2026-10-12T10:00:00Z', demonstrationMode: true, disclaimer: 'Estimates only.',
  },
  certificates: [{ filename: 'organic.pdf' }],
  integrity: { overall: 'VERIFIED', checkedAt: '2026-10-12T10:00:00Z', details: null },
  disclaimer: 'Estimates are not proof of safety.',
};
const URL_OK = 'GET /public/verify/FT-20261001-AAA111';

describe('public verify page', () => {
  it('shows a loading state before data arrives', async () => {
    renderApp('/verify/FT-20261001-AAA111', { routes: { [URL_OK]: () => new Promise(() => {}) } });
    expect(await screen.findByRole('status', { name: /loading batch verification/i })).toBeInTheDocument();
    expect(screen.queryByText('Organic Bananas')).toBeNull();
  });

  it('renders all required sections with data', async () => {
    renderApp('/verify/FT-20261001-AAA111', { routes: { [URL_OK]: ok(PUBLIC) } });
    expect(await screen.findByRole('heading', { name: 'Organic Bananas' })).toBeInTheDocument();
    expect(screen.getByText('Flagged')).toBeInTheDocument();
    expect(screen.getByText('Ecuador')).toBeInTheDocument();
    expect(screen.getByLabelText(/freshness score 52/i)).toBeInTheDocument();
    expect(screen.getByText('4.0 days')).toBeInTheDocument();
    expect(screen.getByText(/demonstration parameters/i)).toBeInTheDocument();
    const timeline = screen.getByRole('list', { name: /batch timeline/i });
    expect(within(timeline).getByText('Green Farms')).toBeInTheDocument();
    expect(within(timeline).getByText('FastFreight')).toBeInTheDocument();
    expect(screen.getByText('organic.pdf')).toBeInTheDocument();
    expect(screen.getByTestId('integrity-result')).toHaveTextContent(/verified/i);
    expect(screen.getByText('Estimates are not proof of safety.')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /temperature history/i })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /humidity history/i })).toBeInTheDocument();
    expect(screen.getByText('Last updated')).toBeInTheDocument();
  });

  it('warns clearly on quarantined batches and on a failed integrity check', async () => {
    const data = {
      ...PUBLIC,
      batch: { ...PUBLIC.batch, status: 'QUARANTINED' },
      integrity: { overall: 'MISMATCH', checkedAt: '2026-10-12T10:00:00Z' },
    };
    renderApp('/verify/FT-20261001-AAA111', { routes: { [URL_OK]: ok(data) } });
    expect(await screen.findByText(/this batch is quarantined and is not cleared for sale/i)).toBeInTheDocument();
    expect(screen.getByTestId('integrity-result')).toHaveTextContent(/mismatch/i);
  });

  it('shows empty chart states when there are no readings', async () => {
    const data = { ...PUBLIC, timeline: [], certificates: [] };
    renderApp('/verify/FT-20261001-AAA111', { routes: { [URL_OK]: ok(data) } });
    expect(await screen.findByText('No temperature readings recorded.')).toBeInTheDocument();
    expect(screen.getByText('No humidity readings recorded.')).toBeInTheDocument();
    expect(screen.getByText('No events recorded yet')).toBeInTheDocument();
    expect(screen.getByText(/no approved certificates/i)).toBeInTheDocument();
  });

  it('shows not found for unknown batches', async () => {
    renderApp('/verify/NOPE-1234', { routes: { 'GET /public/verify/NOPE-1234': apiError(404, 'NOT_FOUND', 'Batch not found') } });
    expect(await screen.findByText('Batch not found')).toBeInTheDocument();
  });

  it('shows an error state with retry for server failures', async () => {
    renderApp('/verify/FT-X-1234', { routes: { 'GET /public/verify/FT-X-1234': apiError(500, 'INTERNAL', 'Boom') } });
    expect(await screen.findByText('Boom')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });
});
