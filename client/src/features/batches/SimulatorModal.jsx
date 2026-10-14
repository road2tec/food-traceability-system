import { useState } from 'react';
import { Modal } from '../../components/ui/Modal';
import { Alert } from '../../components/ui/States';
import { FormError, SelectOptions } from '../../components/ui/Form';
import * as batchService from '../../services/batchService';
import { parseError } from '../../services/api';
import { SIM_SCENARIOS } from '../../utils/constants';

/** Triggers POST /simulate, which runs generated readings through the normal checkpoint pipeline (sourceType=SIMULATOR). */
export default function SimulatorModal({ open, batchId, onClose, onDone }) {
  const [scenario, setScenario] = useState('NORMAL');
  const [count, setCount] = useState('12');
  const [seed, setSeed] = useState('42');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);

  const countNum = Number(count);
  const countOk = Number.isInteger(countNum) && countNum >= 1 && countNum <= 500;
  const seedOk = seed !== '' && Number.isInteger(Number(seed));

  const submit = async (e) => {
    e.preventDefault();
    if (!countOk || !seedOk) return;
    setBusy(true);
    setError(null);
    setDone(false);
    try {
      await batchService.simulate({ batchId, scenario, count: countNum, seed: Number(seed) });
      setDone(true);
      onDone?.();
    } catch (err) {
      setError(parseError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} title="Run demo simulator" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4" aria-label="Simulator form">
        <Alert tone="warn">Simulated readings are labelled SIMULATOR and are for demonstration only.</Alert>
        <FormError error={error} />
        {done && <Alert tone="success">Simulation complete. Records were added through the normal checkpoint pipeline.</Alert>}
        <div>
          <label htmlFor="sim-scenario" className="label">Scenario</label>
          <select id="sim-scenario" className="input" value={scenario} onChange={(e) => setScenario(e.target.value)}>
            <SelectOptions values={SIM_SCENARIOS} />
          </select>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="sim-count" className="label">Readings (1-500)</label>
            <input id="sim-count" className={`input ${countOk ? '' : 'input-error'}`} value={count} onChange={(e) => setCount(e.target.value)} aria-invalid={!countOk} />
            {!countOk && <p role="alert" className="mt-1 text-xs text-red-700">Enter a whole number from 1 to 500.</p>}
          </div>
          <div>
            <label htmlFor="sim-seed" className="label">Seed</label>
            <input id="sim-seed" className={`input ${seedOk ? '' : 'input-error'}`} value={seed} onChange={(e) => setSeed(e.target.value)} aria-invalid={!seedOk} />
            {!seedOk && <p role="alert" className="mt-1 text-xs text-red-700">Seed must be a whole number.</p>}
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Close</button>
          <button type="submit" className="btn-primary" disabled={busy || !countOk || !seedOk}>{busy ? 'Running…' : 'Run simulation'}</button>
        </div>
      </form>
    </Modal>
  );
}
