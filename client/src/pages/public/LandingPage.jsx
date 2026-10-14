import { Link } from 'react-router-dom';
import {
  Boxes, Factory, FileCheck2, Gauge, Link2, LockKeyhole, QrCode, ShieldCheck, Store, Thermometer, Truck, Warehouse, Users,
} from 'lucide-react';

function JourneyIllustration() {
  const stops = [
    { x: 70, label: 'Farm', sub: 'Batch registered', Icon: Factory },
    { x: 230, label: 'Transport', sub: 'Cold-chain readings', Icon: Truck },
    { x: 390, label: 'Warehouse', sub: 'Storage checks', Icon: Warehouse },
    { x: 550, label: 'Retail', sub: 'Shelf-life estimate', Icon: Store },
    { x: 710, label: 'Consumer', sub: 'Scan and verify', Icon: QrCode },
  ];
  return (
    <svg viewBox="0 0 780 250" role="img" aria-labelledby="journey-title journey-desc" className="h-auto w-full">
      <title id="journey-title">Product journey from farm to consumer</title>
      <desc id="journey-desc">A product moves from farm through transport, warehouse and retail to the consumer, with each handover recorded and protected by a SHA-256 integrity hash.</desc>
      <rect x="0" y="0" width="780" height="250" rx="16" fill="#f4f1ea" />
      <path d="M70 110 H710" stroke="#bbcfc5" strokeWidth="4" strokeDasharray="2 10" strokeLinecap="round" />
      <path d="M70 110 H550" stroke="#2f5545" strokeWidth="4" strokeLinecap="round" />
      {stops.map((s, i) => (
        <g key={s.label} transform={`translate(${s.x},110)`}>
          <circle r="32" fill="#fff" stroke={i < 4 ? '#2f5545' : '#f08c0b'} strokeWidth="3" />
          <s.Icon x="-14" y="-14" width="28" height="28" color={i < 4 ? '#26443a' : '#d46a06'} strokeWidth={1.8} />
          <text y="58" textAnchor="middle" fontSize="14" fontWeight="600" fill="#1f2a25">{s.label}</text>
          <text y="76" textAnchor="middle" fontSize="11" fill="#6b7872">{s.sub}</text>
        </g>
      ))}
      {/* integrity hashes */}
      {stops.slice(0, 4).map((s) => (
        <g key={`a${s.x}`} transform={`translate(${s.x},34)`}>
          <line x1="0" y1="8" x2="0" y2="40" stroke="#8fb0a1" strokeWidth="1.5" strokeDasharray="3 3" />
          <rect x="-16" y="-8" width="32" height="16" rx="3" fill="#26443a" />
          <text y="4" textAnchor="middle" fontSize="9" fontWeight="700" fill="#fff">HASH</text>
        </g>
      ))}
      <text x="390" y="232" textAnchor="middle" fontSize="12" fill="#4a5851">Each handover record is hashed so later edits can be detected</text>
    </svg>
  );
}

const STEPS = [
  { Icon: Boxes, title: 'Register', text: 'Producers register a batch with product type, origin and dates. A unique batch ID and QR code are issued.' },
  { Icon: Thermometer, title: 'Record', text: 'Each handler records checkpoints with temperature, humidity and location - manually, by CSV/JSON upload, or from the demo simulator.' },
  { Icon: Gauge, title: 'Predict', text: 'A kinetic freshness model estimates the quality score and remaining shelf life from the temperature history.' },
  { Icon: Link2, title: 'Protect', text: 'A SHA-256 hash of every checkpoint is stored with it, so later edits to a record can be detected.' },
  { Icon: QrCode, title: 'Verify', text: 'Anyone can scan the QR code and see the journey, the freshness estimate and the integrity check - no account needed.' },
];

const BENEFITS = [
  { Icon: Factory, who: 'Producers', text: 'Prove provenance and cold-chain handling to buyers, with certificates attached to the batch.' },
  { Icon: Truck, who: 'Distributors and warehouses', text: 'Structured handover with accept or reject, bulk sensor-log upload and excursion alerts.' },
  { Icon: Store, who: 'Retailers', text: 'See remaining shelf life before shelving. Quarantined batches can never be marked for sale.' },
  { Icon: Users, who: 'Consumers', text: 'Scan to see where food came from and whether its record is intact.' },
  { Icon: ShieldCheck, who: 'Regulators and admins', text: 'Audit trails, quarantine review with mandatory reasons, and exportable reports.' },
];

export default function LandingPage() {
  return (
    <>
      <section className="bg-forest-900 text-white">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-14 sm:px-6 md:grid-cols-2 md:py-20">
          <div>
            <p className="text-sm font-semibold uppercase tracking-widest text-amber-400">Food traceability and freshness</p>
            <h1 className="mt-3 text-3xl font-semibold leading-tight text-white sm:text-4xl lg:text-5xl">
              Know where food has been, and how it has been kept.
            </h1>
            <p className="mt-4 max-w-xl text-base text-forest-200">
              FreshChain links every handover of a food batch to hash-protected records and a transparent freshness estimate, so producers,
              handlers and consumers can check the same facts.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link to="/scan" className="btn-accent px-5 py-2.5"><QrCode className="h-4 w-4" aria-hidden="true" /> Scan a product QR</Link>
              <Link to="/register" className="btn border border-forest-500 px-5 py-2.5 text-white hover:bg-forest-800">Request an account</Link>
            </div>
          </div>
          <div className="rounded-2xl bg-paper p-3 shadow-pop">
            <JourneyIllustration />
          </div>
        </div>
      </section>

      <section id="how-it-works" className="scroll-mt-16 bg-white py-14">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <h2 className="text-2xl font-semibold">How it works</h2>
          <p className="mt-2 max-w-2xl text-ink-soft">Five steps from the farm gate to the consumer's phone.</p>
          <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {STEPS.map(({ Icon, title, text }, i) => (
              <li key={title} className="card p-4">
                <div className="flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-md bg-forest-50 text-forest-700"><Icon className="h-4 w-4" aria-hidden="true" /></span>
                  <span className="text-xs font-semibold text-amber-700">Step {i + 1}</span>
                </div>
                <h3 className="mt-3 font-semibold">{title}</h3>
                <p className="mt-1 text-sm text-ink-soft">{text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="traceability" className="scroll-mt-16 py-14">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 sm:px-6 md:grid-cols-2">
          <div>
            <h2 className="text-2xl font-semibold">End-to-end traceability</h2>
            <p className="mt-3 text-ink-soft">
              Custody moves only through an explicit propose and accept handover. Each checkpoint carries who recorded it, where, when, and the
              conditions measured. The timeline on a batch is built from those records, in order.
            </p>
          </div>
          <div id="freshness" className="scroll-mt-16">
            <h2 className="text-2xl font-semibold">Freshness prediction</h2>
            <p className="mt-3 text-ink-soft">
              The model accumulates thermal exposure with an Arrhenius-style acceleration factor against a product reference temperature, and
              converts it to a 0-100 score and remaining shelf life. Scores above 60 are SAFE, 40 to 60 FLAGGED, and below 40 QUARANTINED
              in the demo defaults. Parameters are configurable per product type and are marked when they are demonstration values.
            </p>
          </div>
        </div>
      </section>

      <section id="integrity" className="scroll-mt-16 bg-paper-100 py-14">
        <div className="mx-auto grid max-w-6xl items-start gap-8 px-4 sm:px-6 md:grid-cols-2">
          <div>
            <h2 className="text-2xl font-semibold">Data integrity check, explained</h2>
            <p className="mt-3 text-ink-soft">
              Every checkpoint is stored together with a SHA-256 hash of its contents. When a batch is verified, the server recomputes each
              hash from the stored record and compares it with the hash saved when the record was created.
            </p>
            <p className="mt-3 text-ink-soft">
              A match means the stored record has not changed since it was created. It does <strong>not</strong> prove the original sensor
              reading was truthful. A mismatch is flagged and the batch is sent for review.
            </p>
          </div>
          <div className="card p-5">
            <h3 className="font-semibold">Consumer QR demo</h3>
            <p className="mt-1 text-sm text-ink-soft">Open the scanner, point it at a batch QR code, or type a batch ID such as FT-20260101-ABC123.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link to="/scan" className="btn-primary"><QrCode className="h-4 w-4" aria-hidden="true" /> Open scanner</Link>
            </div>
          </div>
        </div>
      </section>

      <section id="benefits" className="scroll-mt-16 bg-white py-14">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <h2 className="text-2xl font-semibold">Benefits for each stakeholder</h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {BENEFITS.map(({ Icon, who, text }) => (
              <div key={who} className="card p-5">
                <Icon className="h-5 w-5 text-amber-600" aria-hidden="true" />
                <h3 className="mt-3 font-semibold">{who}</h3>
                <p className="mt-1 text-sm text-ink-soft">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="security" className="scroll-mt-16 py-14">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 sm:px-6 md:grid-cols-2">
          <div>
            <h2 className="flex items-center gap-2 text-2xl font-semibold"><LockKeyhole className="h-5 w-5 text-forest-600" aria-hidden="true" /> Security</h2>
            <ul className="mt-4 list-disc space-y-2 pl-5 text-ink-soft">
              <li>Role-based access enforced on the server; accounts are approved by an administrator.</li>
              <li>Public pages never expose emails, phone numbers, prices or internal notes.</li>
              <li>Quarantined batches are released only by an administrator with a recorded reason.</li>
              <li>Every sensitive action is written to an audit log.</li>
            </ul>
          </div>
          <div>
            <h2 className="flex items-center gap-2 text-2xl font-semibold"><FileCheck2 className="h-5 w-5 text-amber-600" aria-hidden="true" /> Limitations</h2>
            <ul className="mt-4 list-disc space-y-2 pl-5 text-ink-soft">
              <li>Software only: there is no physical sensor integration. Readings are entered, uploaded or simulated.</li>
              <li>Freshness values are estimates and thresholds are demonstration defaults, not food-safety standards.</li>
              <li>A hash match shows data is unchanged, not that it was truthful at the source.</li>
              <li>Integrity hashes detect later changes to stored data; they cannot detect false data entered at the source.</li>
            </ul>
          </div>
        </div>
      </section>
    </>
  );
}
