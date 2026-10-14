import { useCallback, useState } from 'react';
import { parseError } from '../services/api';

/** Wraps a mutation: `run(...args)` returns the result or undefined on failure (error kept in state). */
export function useAction(fn) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const run = useCallback(
    async (...args) => {
      setBusy(true);
      setError(null);
      try {
        return await fn(...args);
      } catch (e) {
        setError(parseError(e));
        return undefined;
      } finally {
        setBusy(false);
      }
    },
    [fn],
  );
  return { run, busy, error, clear: () => setError(null) };
}
