import { useCallback, useEffect, useRef, useState } from 'react';
import { parseError } from '../services/api';

/**
 * Runs an async loader and exposes {data, meta, loading, error, reload}.
 * The loader may return raw data or `{data, meta}` (as list services do).
 */
export function useApi(loader, deps = [], { enabled = true } = {}) {
  const [state, setState] = useState({ data: null, meta: null, loading: enabled, error: null });
  const seq = useRef(0);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  const run = useCallback(async () => {
    const id = ++seq.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const res = await loaderRef.current();
      if (id !== seq.current) return;
      const isEnvelope = res && typeof res === 'object' && !Array.isArray(res) && 'data' in res && 'meta' in res;
      setState({ data: isEnvelope ? res.data : res, meta: isEnvelope ? res.meta || null : null, loading: false, error: null });
    } catch (err) {
      if (id !== seq.current) return;
      setState((s) => ({ ...s, loading: false, error: parseError(err) }));
    }
  }, []);

  useEffect(() => {
    if (enabled) run();
    return () => {
      seq.current += 1;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, ...deps]);

  return { ...state, reload: run };
}
