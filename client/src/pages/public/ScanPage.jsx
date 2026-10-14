import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, ImageUp, Keyboard } from 'lucide-react';
import { Alert } from '../../components/ui/States';

/** Accepts a verify URL or a bare batch ID; returns the batch ID or null. */
export function extractBatchId(text) {
  if (!text) return null;
  const t = String(text).trim();
  const m = t.match(/\/verify\/([^/?#\s]+)/i);
  const id = m ? decodeURIComponent(m[1]) : t;
  return /^[A-Za-z0-9][A-Za-z0-9_-]{3,63}$/.test(id) ? id : null;
}

export default function ScanPage() {
  const navigate = useNavigate();
  const [manual, setManual] = useState('');
  const [error, setError] = useState('');
  const [scanning, setScanning] = useState(false);
  const scannerRef = useRef(null);

  const go = (text) => {
    const id = extractBatchId(text);
    if (!id) {
      setError('That does not look like a batch ID or a verification link.');
      return false;
    }
    navigate(`/verify/${encodeURIComponent(id)}`);
    return true;
  };

  const stop = async () => {
    const s = scannerRef.current;
    scannerRef.current = null;
    if (s) {
      try { await s.stop(); } catch { /* not running */ }
      try { s.clear(); } catch { /* ignore */ }
    }
    setScanning(false);
  };

  useEffect(() => () => { stop(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const startCamera = async () => {
    setError('');
    try {
      const { Html5Qrcode } = await import('html5-qrcode');
      const scanner = new Html5Qrcode('qr-reader');
      scannerRef.current = scanner;
      setScanning(true);
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 240, height: 240 } },
        async (decoded) => {
          if (extractBatchId(decoded)) {
            await stop();
            go(decoded);
          }
        },
        () => {},
      );
    } catch (e) {
      setScanning(false);
      scannerRef.current = null;
      setError(`Camera unavailable: ${e?.message || e}. You can upload a photo of the code or type the batch ID instead.`);
    }
  };

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError('');
    try {
      const { Html5Qrcode } = await import('html5-qrcode');
      const scanner = new Html5Qrcode('qr-reader-file', false);
      const text = await scanner.scanFile(file, false);
      try { scanner.clear(); } catch { /* ignore */ }
      go(text);
    } catch {
      setError('No QR code could be read from that image. Try a clearer, closer photo.');
    }
  };

  const onManual = (e) => {
    e.preventDefault();
    setError('');
    go(manual);
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-semibold">Scan a product QR code</h1>
      <p className="mt-1 text-sm text-ink-soft">No account needed. Scan the code on the package to see its journey and freshness estimate.</p>

      {error && <Alert tone="error" className="mt-4">{error}</Alert>}

      <section className="card mt-6 p-5" aria-label="Camera scan">
        <h2 className="flex items-center gap-2 text-sm font-semibold"><Camera className="h-4 w-4" aria-hidden="true" /> Use the camera</h2>
        <div id="qr-reader" className={`mt-3 overflow-hidden rounded-md ${scanning ? 'min-h-[260px] bg-black' : 'hidden'}`} />
        <div className="mt-3 flex gap-2">
          {scanning ? (
            <button type="button" className="btn-secondary" onClick={stop}>Stop camera</button>
          ) : (
            <button type="button" className="btn-primary" onClick={startCamera}>Start camera</button>
          )}
        </div>
      </section>

      <section className="card mt-4 p-5" aria-label="Upload an image">
        <h2 className="flex items-center gap-2 text-sm font-semibold"><ImageUp className="h-4 w-4" aria-hidden="true" /> Upload a photo of the code</h2>
        <label className="btn-secondary mt-3 cursor-pointer">
          Choose image
          <input type="file" accept="image/*" className="sr-only" onChange={onFile} aria-label="Choose QR image" />
        </label>
        <div id="qr-reader-file" className="hidden" />
      </section>

      <form onSubmit={onManual} className="card mt-4 p-5" aria-label="Enter batch ID">
        <h2 className="flex items-center gap-2 text-sm font-semibold"><Keyboard className="h-4 w-4" aria-hidden="true" /> Type the batch ID</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          <label htmlFor="manual-id" className="sr-only">Batch ID</label>
          <input id="manual-id" className="input max-w-xs flex-1" placeholder="FT-20260101-ABC123" value={manual} onChange={(e) => setManual(e.target.value)} />
          <button type="submit" className="btn-primary">Verify</button>
        </div>
      </form>
    </div>
  );
}
