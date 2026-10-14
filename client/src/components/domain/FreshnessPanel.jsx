import { AlertTriangle } from 'lucide-react';
import { RISK_STYLES } from '../ui/Badges';
import { formatDate, formatHours, formatNumber, titleCase } from '../../utils/format';
import { DISCLAIMER } from '../../utils/constants';

function scoreTone(score) {
  if (score > 60) return { stroke: '#2f855a', text: 'text-emerald-700' };
  if (score >= 40) return { stroke: '#d97706', text: 'text-amber-700' };
  return { stroke: '#c53030', text: 'text-red-700' };
}

export function ScoreRing({ score }) {
  const valid = score !== null && score !== undefined && !Number.isNaN(Number(score));
  const s = valid ? Math.max(0, Math.min(100, Number(score))) : 0;
  const r = 44;
  const c = 2 * Math.PI * r;
  const tone = valid ? scoreTone(s) : { stroke: '#d9d2c3', text: 'text-ink-muted' };
  return (
    <div className="relative h-28 w-28 shrink-0" role="img" aria-label={valid ? `Freshness score ${formatNumber(s, 0)} out of 100` : 'Freshness score unavailable'}>
      <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" stroke="#ebe6db" strokeWidth="9" />
        <circle cx="50" cy="50" r={r} fill="none" stroke={tone.stroke} strokeWidth="9" strokeLinecap="round" strokeDasharray={`${(s / 100) * c} ${c}`} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`text-2xl font-semibold tabular-nums ${tone.text}`}>{valid ? formatNumber(s, 0) : '—'}</span>
        <span className="text-[10px] uppercase tracking-wide text-ink-muted">of 100</span>
      </div>
    </div>
  );
}

/** Freshness score, remaining shelf life and risk. Works for public and authenticated prediction payloads. */
export default function FreshnessPanel({ freshness, showFactors = false }) {
  if (!freshness) {
    return <p className="text-sm text-ink-soft">No freshness estimate is available for this batch yet.</p>;
  }
  const score = freshness.score ?? freshness.freshnessScore;
  const warnings = freshness.warnings || [];
  return (
    <div>
      <div className="flex flex-wrap items-center gap-5">
        <ScoreRing score={score} />
        <dl className="grid flex-1 grid-cols-2 gap-x-6 gap-y-3 text-sm">
          <div>
            <dt className="text-xs uppercase tracking-wide text-ink-muted">Remaining shelf life</dt>
            <dd className="mt-0.5 font-semibold">{formatHours(freshness.remainingShelfLifeHours)}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-ink-muted">Risk</dt>
            <dd className={`mt-0.5 font-semibold ${RISK_STYLES[freshness.riskCategory] || ''}`}>{titleCase(freshness.riskCategory) || '—'}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-ink-muted">Model</dt>
            <dd className="mt-0.5">{freshness.modelVersion || '—'}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-ink-muted">Predicted</dt>
            <dd className="mt-0.5">{formatDate(freshness.predictedAt)}</dd>
          </div>
        </dl>
      </div>
      {freshness.demonstrationMode && (
        <p className="mt-3 flex items-start gap-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Demonstration parameters: values are illustrative and not calibrated to a validated food-safety standard.
        </p>
      )}
      {warnings.length > 0 && (
        <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-amber-800">
          {warnings.map((w, i) => <li key={i}>{w}</li>)}
        </ul>
      )}
      {showFactors && Array.isArray(freshness.factors) && freshness.factors.length > 0 && (
        <div className="mt-4">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Contributing factors</h4>
          <ul className="mt-2 space-y-1.5 text-sm">
            {freshness.factors.map((f, i) => (
              <li key={i}><span className="font-medium">{f.name}</span>{f.detail ? <span className="text-ink-soft"> - {f.detail}</span> : null}</li>
            ))}
          </ul>
        </div>
      )}
      <p className="mt-4 text-xs text-ink-muted">{freshness.disclaimer || DISCLAIMER}</p>
    </div>
  );
}
