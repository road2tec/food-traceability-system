import { useState } from 'react';
import { FileDown } from 'lucide-react';
import { useAction } from '../../hooks/useAction';
import * as adminService from '../../services/adminService';
import { PageHeader, Section } from '../../components/ui/Cards';
import { Alert } from '../../components/ui/States';
import { triggerDownload } from '../../utils/format';

const REPORTS = [
  { type: 'batches', title: 'Batches', text: 'All batches with status, lifecycle and custodian.' },
  { type: 'checkpoints', title: 'Checkpoints', text: 'Every recorded reading with source and validation result.' },
  { type: 'audit', title: 'Audit log', text: 'Sensitive actions with actor, entity and timestamp.' },
];

export default function ReportsPage() {
  const [done, setDone] = useState(null);
  const exp = useAction(async (type) => {
    const blob = await adminService.exportReport(type);
    triggerDownload(blob, `${type}-report.csv`);
    return type;
  });
  const [current, setCurrent] = useState(null);
  const run = async (type) => {
    setDone(null);
    setCurrent(type);
    const r = await exp.run(type);
    if (r) setDone(`${type}-report.csv downloaded.`);
  };
  return (
    <>
      <PageHeader title="Report export" subtitle="Download CSV exports of platform data." />
      {done && <div className="mb-4"><Alert tone="success">{done}</Alert></div>}
      {exp.error && <div className="mb-4"><Alert tone="error">{exp.error.message}</Alert></div>}
      <div className="grid gap-4 md:grid-cols-3">
        {REPORTS.map((r) => (
          <Section key={r.type} title={r.title}>
            <p className="text-sm text-ink-soft">{r.text}</p>
            <button type="button" className="btn-primary mt-4" onClick={() => run(r.type)} disabled={exp.busy} aria-label={`Export ${r.title} CSV`}>
              <FileDown className="h-4 w-4" aria-hidden="true" /> {exp.busy && current === r.type ? 'Exporting…' : 'Export CSV'}
            </button>
          </Section>
        ))}
      </div>
    </>
  );
}
