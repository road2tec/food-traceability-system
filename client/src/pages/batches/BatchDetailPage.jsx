import { useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowRightLeft, ClipboardPlus, Cpu, Download, FileUp, Flag, RefreshCw, ShieldCheck, ShoppingCart, XCircle, ShieldAlert,
} from 'lucide-react';
import { useAuth } from '../../features/auth/AuthContext';
import { useApi } from '../../hooks/useApi';
import { useAction } from '../../hooks/useAction';
import * as batchService from '../../services/batchService';
import * as analytics from '../../services/analyticsService';
import * as transferService from '../../services/transferService';
import { StatusBadge, Pill } from '../../components/ui/Badges';
import { Alert, EmptyState, ErrorState, Skeleton } from '../../components/ui/States';
import { DefList, Section } from '../../components/ui/Cards';
import Tabs, { TabPanel } from '../../components/ui/Tabs';
import { ConfirmDialog, Modal } from '../../components/ui/Modal';
import DataTable from '../../components/ui/DataTable';
import Timeline from '../../components/domain/Timeline';
import FreshnessPanel from '../../components/domain/FreshnessPanel';
import { ChartCard, CHART_COLORS, SeriesLine } from '../../components/charts/Charts';
import CheckpointForm from '../../features/batches/CheckpointForm';
import TransferModal from '../../features/batches/TransferModal';
import SimulatorModal from '../../features/batches/SimulatorModal';
import { asList, toSeries } from '../../utils/normalize';
import { formatDate, formatNumber, orgName, titleCase, triggerDownload } from '../../utils/format';
import { canRecordCheckpoint, canReleaseQuarantine, canSell, canSimulate, canTransfer, isCustodian } from '../../utils/permissions';

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'checkpoints', label: 'Checkpoints' },
  { id: 'freshness', label: 'Freshness' },
  { id: 'custody', label: 'Custody' },
  { id: 'integrity', label: 'Data integrity' },
];

export default function BatchDetailPage() {
  const { batchId } = useParams();
  const { user } = useAuth();
  const [tab, setTab] = useState('overview');
  const [modal, setModal] = useState(null); // 'checkpoint' | 'sale' | 'flag' | 'transfer' | 'simulate' | 'release' | 'withdraw'
  const [notice, setNotice] = useState(null);

  const batchQ = useApi(async () => {
    const d = await batchService.getBatch(batchId);
    return d?.batch || d;
  }, [batchId]);
  const cpQ = useApi(() => batchService.listCheckpoints(batchId), [batchId]);
  const predQ = useApi(() => batchService.getPrediction(batchId).catch((e) => (e?.response?.status === 404 ? null : Promise.reject(e))), [batchId]);

  const batch = batchQ.data;
  const refreshAll = () => {
    batchQ.reload();
    cpQ.reload();
    predQ.reload();
  };

  if (batchQ.loading && !batch) {
    return <div role="status" aria-label="Loading batch" className="space-y-4"><Skeleton className="h-16 w-full" /><Skeleton className="h-64 w-full" /></div>;
  }
  if (batchQ.error) {
    return <div className="card"><ErrorState error={batchQ.error} onRetry={batchQ.reload} title={batchQ.error.status === 404 ? 'Batch not found' : 'Could not load batch'} /></div>;
  }
  if (!batch) return null;

  const checkpoints = asList(cpQ.data);
  const freshness = predQ.data || (batch.latestPrediction && typeof batch.latestPrediction === 'object' ? batch.latestPrediction : null);
  const flash = (msg, tone = 'success') => setNotice({ msg, tone });

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm"><Link to="/app/batches" className="text-forest-600 hover:underline">Batches</Link> / <span className="font-mono text-xs">{batch.batchId}</span></p>
          <h1 className="mt-1 text-xl font-semibold sm:text-2xl">{batch.productName}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <StatusBadge status={batch.status} />
            <Pill value={batch.lifecycle} />
            <span className="text-sm text-ink-soft">Custodian: {orgName(batch.currentCustodianOrg)}</span>
          </div>
        </div>
        <ActionBar batch={batch} user={user} setModal={setModal} flash={flash} onChanged={refreshAll} />
      </div>

      {notice && (
        <div className="mb-4"><Alert tone={notice.tone}>{notice.msg}</Alert></div>
      )}
      {batch.status === 'QUARANTINED' && (
        <div className="mb-4">
          <Alert tone="error">
            This batch is QUARANTINED. It cannot be sold and is released only by an administrator with a recorded reason.
          </Alert>
        </div>
      )}
      {batch.status === 'PENDING_REVIEW' && (
        <div className="mb-4">
          <Alert tone="info">This batch is pending review (for example a failed integrity check or unavailable prediction). It is not cleared for sale.</Alert>
        </div>
      )}

      <Tabs tabs={TABS} active={tab} onChange={setTab} label="Batch sections" />

      <TabPanel id="overview" active={tab}>
        <OverviewTab batch={batch} user={user} freshness={freshness} checkpoints={checkpoints} onChanged={refreshAll} flash={flash} />
      </TabPanel>
      <TabPanel id="checkpoints" active={tab}>
        <CheckpointsTab batchId={batch.batchId} checkpointsQ={cpQ} />
      </TabPanel>
      <TabPanel id="freshness" active={tab}>
        <FreshnessTab batchId={batch.batchId} freshness={freshness} error={predQ.error} onRecalculated={refreshAll} flash={flash} />
      </TabPanel>
      <TabPanel id="custody" active={tab}>
        <CustodyTab batchId={batch.batchId} batch={batch} />
      </TabPanel>
      <TabPanel id="integrity" active={tab}>
        <IntegrityTab batchId={batch.batchId} onChanged={refreshAll} />
      </TabPanel>

      <Modal open={modal === 'checkpoint'} title="Record checkpoint" onClose={() => setModal(null)} wide>
        <CheckpointForm batchId={batch.batchId} onSaved={() => { refreshAll(); }} />
      </Modal>
      <Modal open={modal === 'sale'} title="Record sale" onClose={() => setModal(null)} wide>
        <CheckpointForm batchId={batch.batchId} defaultEventType="SALE" eventTypes={['SALE']} onSaved={() => { refreshAll(); }} />
      </Modal>
      <Modal open={modal === 'flag'} title="Flag a concern" onClose={() => setModal(null)} wide>
        <Alert tone="info" className="mb-3">Flags are recorded as an INSPECTION checkpoint with a FLAG remark so the concern is part of the batch history.</Alert>
        <CheckpointForm batchId={batch.batchId} defaultEventType="INSPECTION" eventTypes={['INSPECTION']} remarksPrefix="FLAG: " onSaved={() => { refreshAll(); }} />
      </Modal>
      <TransferModal open={modal === 'transfer'} batchId={batch.batchId} onClose={() => setModal(null)} onDone={() => { flash('Transfer proposed. Custody changes when the receiver accepts.'); refreshAll(); }} />
      <SimulatorModal open={modal === 'simulate'} batchId={batch.batchId} onClose={() => setModal(null)} onDone={refreshAll} />
      <ReleaseDialog open={modal === 'release'} batchId={batch.batchId} onClose={() => setModal(null)} onDone={() => { flash('Quarantine released and logged.'); refreshAll(); }} />
      <WithdrawDialog open={modal === 'withdraw'} batchId={batch.batchId} onClose={() => setModal(null)} onDone={() => { flash('Batch withdrawn.'); refreshAll(); }} />
    </div>
  );
}

function ActionBar({ batch, user, setModal, flash, onChanged }) {
  const qr = useAction(async () => {
    const blob = await batchService.fetchQrBlob(batch.batchId);
    triggerDownload(blob, `${batch.batchId}-qr.png`);
  });
  const custodian = isCustodian(user, batch);
  const handler = user.role !== 'ADMIN' && custodian;
  void flash; void onChanged;
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Batch actions">
      <button type="button" className="btn-secondary" onClick={() => qr.run()} disabled={qr.busy}>
        <Download className="h-4 w-4" aria-hidden="true" /> {qr.busy ? 'Preparing…' : 'Download QR'}
      </button>
      {canRecordCheckpoint(user, batch) && (
        <button type="button" className="btn-primary" onClick={() => setModal('checkpoint')}><ClipboardPlus className="h-4 w-4" aria-hidden="true" /> Add checkpoint</button>
      )}
      {handler && user.role !== 'PRODUCER' && (
        <button type="button" className="btn-secondary" onClick={() => setModal('flag')}><Flag className="h-4 w-4" aria-hidden="true" /> Flag concern</button>
      )}
      {canSell(user, batch) && (
        <button type="button" className="btn-accent" onClick={() => setModal('sale')}><ShoppingCart className="h-4 w-4" aria-hidden="true" /> Record sale</button>
      )}
      {canTransfer(user, batch) && (
        <button type="button" className="btn-secondary" onClick={() => setModal('transfer')}><ArrowRightLeft className="h-4 w-4" aria-hidden="true" /> Transfer custody</button>
      )}
      {canSimulate(user.role) && (
        <button type="button" className="btn-secondary" onClick={() => setModal('simulate')}><Cpu className="h-4 w-4" aria-hidden="true" /> Simulator</button>
      )}
      {canReleaseQuarantine(user, batch) && (
        <button type="button" className="btn-danger" onClick={() => setModal('release')}><ShieldAlert className="h-4 w-4" aria-hidden="true" /> Release quarantine</button>
      )}
      {(user.role === 'ADMIN' || (custodian && user.role === 'PRODUCER')) && !['WITHDRAWN', 'SOLD'].includes(batch.lifecycle) && (
        <button type="button" className="btn-secondary" onClick={() => setModal('withdraw')}><XCircle className="h-4 w-4" aria-hidden="true" /> Withdraw</button>
      )}
      {qr.error && <p role="alert" className="w-full text-sm text-red-700">{qr.error.message}</p>}
    </div>
  );
}

function ReleaseDialog({ open, batchId, onClose, onDone }) {
  const act = useAction((reason) => batchService.releaseQuarantine(batchId, reason));
  return (
    <ConfirmDialog
      open={open}
      title="Release from quarantine"
      message="Releasing a quarantined batch is recorded in the audit log. A reason is mandatory."
      confirmLabel="Release batch"
      danger
      requireReason
      reasonLabel="Reason for release"
      busy={act.busy}
      error={act.error}
      onCancel={() => { act.clear(); onClose(); }}
      onConfirm={async (reason) => {
        const r = await act.run(reason);
        if (r !== undefined) { onDone(); onClose(); }
      }}
    />
  );
}

function WithdrawDialog({ open, batchId, onClose, onDone }) {
  const act = useAction(() => batchService.withdrawBatch(batchId));
  return (
    <ConfirmDialog
      open={open}
      title="Withdraw batch"
      message="Withdrawing removes this batch from circulation. This cannot be undone."
      confirmLabel="Withdraw"
      danger
      busy={act.busy}
      error={act.error}
      onCancel={() => { act.clear(); onClose(); }}
      onConfirm={async () => {
        const r = await act.run();
        if (r !== undefined) { onDone(); onClose(); }
      }}
    />
  );
}

function OverviewTab({ batch, user, freshness, checkpoints, onChanged, flash }) {
  const fileRef = useRef(null);
  const upload = useAction((file) => batchService.uploadCertificate(batch.batchId, file));
  const certs = batch.certificates || [];
  const isProducerOrg = user.role === 'PRODUCER';

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const r = await upload.run(file);
    if (r !== undefined) { flash('Certificate uploaded. It appears publicly once an administrator approves it.'); onChanged(); }
  };

  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <div className="space-y-5 lg:col-span-2">
        <Section title="Batch details">
          <DefList
            items={[
              ['Batch ID', <span key="i" className="font-mono text-xs">{batch.batchId}</span>],
              ['Category', titleCase(batch.category)],
              ['Quantity', batch.quantity !== undefined ? `${formatNumber(batch.quantity, 2)} ${batch.unit || ''}` : '—'],
              ['Origin', batch.origin],
              ['Producer', orgName(batch.producerOrg)],
              ['Current custodian', orgName(batch.currentCustodianOrg)],
              ['Harvest / production date', formatDate(batch.harvestDate, false)],
              ['Expiry date', formatDate(batch.expiryDate, false)],
              ['Recommended storage', batch.referenceStorage ? `${batch.referenceStorage.tempC ?? '—'} °C, ${batch.referenceStorage.humidityPct ?? '—'}% RH` : '—'],
              ['Checkpoints', checkpoints.length],
              ...(user.role === 'ADMIN' || isProducerOrg ? [['Internal notes', batch.internalNotes || '—']] : []),
            ]}
          />
        </Section>
        <Section title="Timeline">
          <Timeline events={[...checkpoints].sort((a, b) => new Date(a.eventTimestamp || a.timestamp) - new Date(b.eventTimestamp || b.timestamp))} />
        </Section>
      </div>
      <div className="space-y-5">
        <Section title="Freshness estimate"><FreshnessPanel freshness={freshness} /></Section>
        <Section
          title="Certificates"
          actions={
            isProducerOrg && (
              <>
                <input ref={fileRef} type="file" accept=".pdf,image/*" className="sr-only" aria-label="Certificate file" onChange={onFile} />
                <button type="button" className="btn-secondary px-2.5 py-1 text-xs" onClick={() => fileRef.current?.click()} disabled={upload.busy}>
                  <FileUp className="h-3.5 w-3.5" aria-hidden="true" /> {upload.busy ? 'Uploading…' : 'Upload'}
                </button>
              </>
            )
          }
        >
          {upload.error && <p role="alert" className="mb-2 text-sm text-red-700">{upload.error.message}</p>}
          {certs.length === 0 ? (
            <p className="text-sm text-ink-soft">No certificates uploaded.</p>
          ) : (
            <ul className="divide-y divide-paper-200 text-sm">
              {certs.map((c, i) => (
                <li key={c._id || c.id || i} className="flex items-center justify-between gap-2 py-2">
                  <span className="truncate">{c.filename || 'Certificate'}</span>
                  <Pill value={c.approved ? 'APPROVED' : 'PENDING'} />
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </div>
  );
}

function CheckpointsTab({ batchId, checkpointsQ }) {
  const seriesQ = useApi(() => analytics.batchSeries(batchId), [batchId]);
  const rows = asList(checkpointsQ.data);
  let series = toSeries(seriesQ.data);
  if (series.length === 0) series = toSeries(rows);
  const hasTemp = series.some((s) => s.temperatureC !== null);
  const hasHum = series.some((s) => s.humidityPct !== null);
  const columns = [
    { key: 'when', header: 'Time', render: (c) => formatDate(c.eventTimestamp || c.timestamp) },
    { key: 'eventType', header: 'Event', render: (c) => titleCase(c.eventType) },
    { key: 'temp', header: 'Temp (°C)', render: (c) => formatNumber(c.temperatureC) },
    { key: 'hum', header: 'Humidity (%)', render: (c) => formatNumber(c.humidityPct) },
    { key: 'location', header: 'Location' },
    { key: 'org', header: 'Organisation', render: (c) => orgName(c.organisation) },
    { key: 'source', header: 'Source', render: (c) => titleCase(c.sourceType) },
    { key: 'valid', header: 'Valid', render: (c) => (c.validation?.ok === false ? <span className="text-red-700">Rejected</span> : 'OK') },
  ];
  return (
    <div className="space-y-5">
      <div className="grid gap-5 md:grid-cols-2">
        <ChartCard title="Temperature history" loading={seriesQ.loading} error={seriesQ.error} onRetry={seriesQ.reload} empty={!hasTemp} emptyMessage="No temperature readings yet." height={220}>
          <SeriesLine data={series} dataKey="temperatureC" name="Temperature" color={CHART_COLORS.temp} unit=" °C" />
        </ChartCard>
        <ChartCard title="Humidity history" loading={seriesQ.loading} error={seriesQ.error} onRetry={seriesQ.reload} empty={!hasHum} emptyMessage="No humidity readings yet." height={220}>
          <SeriesLine data={series} dataKey="humidityPct" name="Humidity" color={CHART_COLORS.humidity} unit="%" />
        </ChartCard>
      </div>
      <DataTable
        caption="Checkpoints"
        columns={columns}
        rows={rows}
        loading={checkpointsQ.loading}
        error={checkpointsQ.error}
        onRetry={checkpointsQ.reload}
        rowKey={(c) => c.checkpointId || c._id}
        emptyTitle="No checkpoints recorded"
        emptyMessage="Add a checkpoint, upload a CSV/JSON log, or run the simulator."
      />
    </div>
  );
}

function FreshnessTab({ batchId, freshness, error, onRecalculated, flash }) {
  const histQ = useApi(() => batchService.getPredictionHistory(batchId), [batchId]);
  const recalc = useAction(() => batchService.recalculatePrediction(batchId));
  const history = asList(histQ.data);
  const columns = [
    { key: 'at', header: 'Predicted', render: (p) => formatDate(p.predictedAt) },
    { key: 'score', header: 'Score', render: (p) => formatNumber(p.score ?? p.freshnessScore, 0) },
    { key: 'rem', header: 'Remaining (h)', render: (p) => formatNumber(p.remainingShelfLifeHours) },
    { key: 'risk', header: 'Risk', render: (p) => titleCase(p.riskCategory) },
    { key: 'n', header: 'Checkpoints', render: (p) => p.checkpointCount ?? '—' },
    { key: 'model', header: 'Model', render: (p) => p.modelVersion || '—' },
  ];
  return (
    <div className="space-y-5">
      <Section
        title="Latest estimate"
        actions={
          <button type="button" className="btn-secondary px-2.5 py-1 text-xs" disabled={recalc.busy}
            onClick={async () => { const r = await recalc.run(); if (r !== undefined) { flash('Prediction recalculated.'); onRecalculated(); histQ.reload(); } }}>
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> {recalc.busy ? 'Recalculating…' : 'Recalculate'}
          </button>
        }
      >
        {recalc.error && <p role="alert" className="mb-2 text-sm text-red-700">{recalc.error.message}</p>}
        {error && !freshness ? <ErrorState error={error} title="Prediction unavailable" /> : <FreshnessPanel freshness={freshness} showFactors />}
      </Section>
      <div>
        <h2 className="mb-2 text-sm font-semibold">Prediction history</h2>
        <DataTable columns={columns} rows={history} loading={histQ.loading} error={histQ.error} onRetry={histQ.reload} rowKey={(p) => p._id || p.predictedAt} emptyTitle="No predictions yet" emptyMessage="A prediction is created after the first checkpoint." />
      </div>
    </div>
  );
}

function CustodyTab({ batchId, batch }) {
  const q = useApi(() => transferService.listTransfers({ limit: 100 }), [batchId]);
  const rows = asList(q.data).filter((t) => (typeof t.batchId === 'object' ? t.batchId.batchId : t.batchId) === batchId);
  const columns = [
    { key: 'from', header: 'From', render: (t) => orgName(t.fromOrg) },
    { key: 'to', header: 'To', render: (t) => orgName(t.toOrg) },
    { key: 'state', header: 'State', render: (t) => <Pill value={t.state} /> },
    { key: 'when', header: 'Proposed', render: (t) => formatDate(t.createdAt) },
    { key: 'reason', header: 'Reason / remarks', render: (t) => t.reason || t.remarks || '—' },
  ];
  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-soft">Current custodian: <strong>{orgName(batch.currentCustodianOrg)}</strong></p>
      <DataTable caption="Custody transfers" columns={columns} rows={rows} loading={q.loading} error={q.error} onRetry={q.reload} rowKey={(t) => t._id || t.id} emptyTitle="No transfers" emptyMessage="Custody has not changed hands for this batch." />
    </div>
  );
}

function IntegrityTab({ batchId, onChanged }) {
  const verify = useAction(() => batchService.verifyBatch(batchId));
  const [result, setResult] = useState(null);
  const run = async () => {
    const r = await verify.run();
    if (r !== undefined) { setResult(r); onChanged(); }
  };
  const cps = result?.checkpoints || [];
  const mismatches = cps.filter((c) => c.match === false).length;
  const columns = [
    { key: 'id', header: 'Checkpoint', render: (c) => <span className="font-mono text-xs">{String(c.checkpointId).slice(0, 8)}</span> },
    { key: 'local', header: 'Recomputed hash', render: (c) => <span className="break-all font-mono text-[11px]">{c.localHash}</span> },
    { key: 'stored', header: 'Stored hash', render: (c) => <span className="break-all font-mono text-[11px]">{c.storedHash ?? c.chainHash ?? '—'}</span> },
    { key: 'match', header: 'Result', render: (c) => (c.match ? <span className="font-medium text-emerald-700">Match</span> : <span className="font-medium text-red-700">Mismatch</span>) },
  ];
  return (
    <div className="space-y-4">
      <Section
        title="Data integrity check"
        actions={<button type="button" className="btn-primary px-3 py-1.5 text-xs" onClick={run} disabled={verify.busy}><ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" /> {verify.busy ? 'Checking…' : 'Run integrity check'}</button>}
      >
        <p className="text-sm text-ink-soft">
          Recomputes the SHA-256 hash of each stored checkpoint and compares it with the hash saved when it was recorded. A match shows the data is unchanged; it does not prove the original reading was truthful.
        </p>
        {verify.error && <p role="alert" className="mt-3 text-sm text-red-700">{verify.error.message}</p>}
        {result && (
          <div className="mt-4" data-testid="verify-result">
            <Alert tone={mismatches > 0 || /MISMATCH|FAIL/i.test(String(result.overall)) ? 'error' : 'success'}>
              Overall result: <strong>{titleCase(result.overall)}</strong>{cps.length ? ` (${cps.length - mismatches} of ${cps.length} checkpoints match)` : ''}
            </Alert>
          </div>
        )}
      </Section>
      {result && cps.length > 0 && <DataTable columns={columns} rows={cps} rowKey={(c) => c.checkpointId} />}
      {!result && !verify.busy && <EmptyState title="No check run yet" message="Run an integrity check to see the results." />}
    </div>
  );
}
