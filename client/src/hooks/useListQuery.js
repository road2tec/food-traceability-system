import { useCallback, useEffect, useState } from 'react';
import { useApi } from './useApi';

/**
 * Server-driven list state: page, limit, sort, q and arbitrary filters.
 * `fetcher(params)` must resolve to `{data, meta}` (list services do).
 */
export function useListQuery(fetcher, { limit = 20, sort = '-createdAt', filters = {}, enabled = true } = {}) {
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState(sort);
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  const filterKey = JSON.stringify(filters);
  useEffect(() => {
    setPage(1);
  }, [debouncedQ, filterKey, sortBy]);

  const params = { page, limit, sort: sortBy, ...(debouncedQ ? { q: debouncedQ } : {}) };
  Object.entries(filters).forEach(([k, v]) => {
    if (v !== '' && v !== undefined && v !== null) params[k] = v;
  });

  const api = useApi(() => fetcher(params), [page, limit, sortBy, debouncedQ, filterKey], { enabled });

  const toggleSort = useCallback((field) => {
    setSortBy((cur) => (cur === field ? `-${field}` : cur === `-${field}` ? field : field));
  }, []);

  return { ...api, rows: Array.isArray(api.data) ? api.data : [], page, setPage, sortBy, toggleSort, q, setQ, limit };
}
