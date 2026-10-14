import { useState } from 'react';
import { Upload } from 'lucide-react';
import { useApi } from '../../hooks/useApi';
import { useAction } from '../../hooks/useAction';
import { useAuth } from '../../features/auth/AuthContext';
import * as batchService from '../../services/batchService';
import { PageHeader, Section, StatCard } from '../../components/ui/Cards';
import { Alert, ErrorState } from '../../components/ui/States';
import { Field } from '../../components/ui/Form';
import DataTable from '../../components/ui/DataTable';
import { asList } from '../../utils/normalize';
import { canRecordCheckpoint } from '../../utils/permissions';

const MAX_BYTES = 5 * 1024 * 1024;

export default function ImportPage() {
  const { user } = useAuth();
  const { data, error, reload } = useApi(() => batchService.listBatches({ limit: 100 }), []);
  const batches = asList(data).filter((b) => canRecordCheckpoint(user, b));
  const [batchId, setBatchId] = useState('');
  const [file, setFile] = useState(null);
  const [fileError, setFileError] = useState('');
  const [preview, setPreview] = useState(null);
  const [outcome, setOutcome] = useState(null);
  const previewAct = useAction((b, f) => batchService.previewImport(b, f));
  const commitAct = useAction((id) => batchService.commitImport(id));

  const onFile = (e) => {
    const f = e.target.files?.[0];
    setPreview(null);
    setOutcome(null);
    setFileError('');
    if (!f) return setFile(null);
    if (!/\.(csv|json)$/i.test(f.name)) {
      setFile(null);
      return setFileError('Only .csv or .json files are accepted.');
    }
    if (f.size > MAX_BYTES) {
      setFile(null);
      return setFileError('File is larger than 5 MB.');
    }
    setFile(f);
  };

  const doPreview = async (e) => {
    e.preventDefault();
    if (!batchId || !file) return;
    setOutcome(null);
    const r = await previewAct.run(batchId, file);
    if (r !== undefined) setPreview(r);
  };

  const doCommit = async () => {
    const r = await commitAct.run(preview.importId);
    if (r !== undefined) {
      setOutcome(r);
      setPreview(null);
      setFile(null);
    }
  };

  const rows = preview?.rows || [];
  const columns = [
    { key: 'row', header: 'Row' },
    { key: 'status', header: 'Result', render: (r) => (r.errors?.length ? <span className="font-medium text-red-700">Rejected</span> : <span className="font-medium text-emerald-700">Valid</span>) },
    { key: 'record', header: 'Record', render: (r) => (r.record ? <span className="text-xs">{`${r.record.timestamp || r.record.eventTimestamp || ''} | ${r.record.temperatureC ?? r.record.temperature_c ?? ''} °C | ${r.record.humidityPct ?? r.record.humidity_pct ?? ''}% | ${r.record.location || ''}`}</span> : '—') },
    { key: 'errors', header: 'Errors', render: (r) => (r.errors?.length ? <ul className="list-disc pl-4 text-xs text-red-700">{r.errors.map((m, i) => <li key={i}>{typeof m === 'string' ? m : m.message}</li>)}</ul> : '—') },
  ];

  return (
    <div>
      <PageHeader title="CSV / JSON upload" subtitle="Preview sensor-log records, review any rejected rows, then commit the valid ones." />
      <Section title="1. Choose batch and file">
        {error ? <ErrorState error={error} onRetry={reload} /> : (
          <form onSubmit={doPreview} className="grid max-w-2xl gap-4" aria-label="Import form">
            <Field label="Batch" required>
              <select className="input" value={batchId} onChange={(e) => { setBatchId(e.target.value); setPreview(null); }}>
                <option value="">Select a batch in your custody</option>
                {batches.map((b) => <option key={b.batchId} value={b.batchId}>{b.batchId} - {b.productName}</option>)}
              </select>
            </Field>
            <Field label="File (.csv or .json, max 5 MB)" error={fileError} hint="CSV columns: timestamp, temperature_c, humidity_pct, location, event_type, remarks" required>
              <input type="file" accept=".csv,.json,application/json,text/csv" className="input" onChange={onFile} />
            </Field>
            {previewAct.error && <Alert tone="error">{previewAct.error.message}</Alert>}
            <div>
              <button type="submit" className="btn-primary" disabled={!batchId || !file || previewAct.busy}>
                <Upload className="h-4 w-4" aria-hidden="true" /> {previewAct.busy ? 'Validating…' : 'Preview import'}
              </button>
            </div>
          </form>
        )}
      </Section>

      {preview && (
        <div className="mt-6 space-y-4" aria-label="Import preview">
          <h2 className="text-sm font-semibold">2. Review</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard label="Total rows" value={preview.total} />
            <StatCard label="Valid" value={preview.valid} tone="safe" />
            <StatCard label="Rejected" value={preview.rejected} tone={preview.rejected ? 'danger' : 'neutral'} />
          </div>
          <DataTable columns={columns} rows={rows} rowKey={(r) => r.row} emptyTitle="No rows" />
          {commitAct.error && <Alert tone="error">{commitAct.error.message}</Alert>}
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className="btn-primary" onClick={doCommit} disabled={commitAct.busy || !preview.valid}>
              {commitAct.busy ? 'Committing…' : `Commit ${preview.valid} valid record${preview.valid === 1 ? '' : 's'}`}
            </button>
            {preview.rejected > 0 && <span className="text-sm text-ink-soft">Rejected rows are skipped and are not stored.</span>}
          </div>
        </div>
      )}

      {outcome && (
        <div className="mt-6" aria-label="Import result">
          <Alert tone="success">Import committed.</Alert>
          <div className="mt-3 grid gap-4 sm:grid-cols-3">
            <StatCard label="Total" value={outcome.total} />
            <StatCard label="Committed" value={outcome.committed} tone="safe" />
            <StatCard label="Rejected" value={outcome.rejected} tone={outcome.rejected ? 'danger' : 'neutral'} />
          </div>
        </div>
      )}
    </div>
  );
}
