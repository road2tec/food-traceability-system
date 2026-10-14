import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { EmptyState, ErrorState, SkeletonRows } from './States';

/**
 * Presentational, server-driven table.
 * columns: [{key, header, sortField?, render?(row), className?}]
 * Sorting/pagination/search are controlled by the parent (see useListQuery).
 */
export default function DataTable({
  columns,
  rows,
  loading,
  error,
  onRetry,
  meta,
  page,
  onPage,
  sortBy,
  onSort,
  search,
  onSearch,
  searchPlaceholder = 'Search…',
  toolbar,
  emptyTitle = 'No records found',
  emptyMessage = 'Nothing matches the current filters.',
  rowKey = (r) => r._id || r.id,
  caption,
}) {
  const totalPages = meta?.totalPages || 1;
  const total = meta?.total;

  return (
    <div className="card overflow-hidden">
      {(onSearch || toolbar) && (
        <div className="flex flex-wrap items-center gap-3 border-b border-paper-200 p-3">
          {onSearch && (
            <div className="relative min-w-[12rem] flex-1 sm:max-w-xs">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-ink-muted" aria-hidden="true" />
              <input
                type="search"
                aria-label="Search"
                className="input pl-8"
                placeholder={searchPlaceholder}
                value={search}
                onChange={(e) => onSearch(e.target.value)}
              />
            </div>
          )}
          {toolbar}
        </div>
      )}

      {error ? (
        <ErrorState error={error} onRetry={onRetry} />
      ) : loading && rows.length === 0 ? (
        <SkeletonRows />
      ) : rows.length === 0 ? (
        <EmptyState title={emptyTitle} message={emptyMessage} />
      ) : (
        <div className={`overflow-x-auto ${loading ? 'opacity-60' : ''}`}>
          <table className="min-w-full divide-y divide-paper-200">
            {caption && <caption className="sr-only">{caption}</caption>}
            <thead className="bg-paper-100">
              <tr>
                {columns.map((c) => {
                  const active = c.sortField && (sortBy === c.sortField || sortBy === `-${c.sortField}`);
                  const desc = sortBy === `-${c.sortField}`;
                  return (
                    <th
                      key={c.key}
                      scope="col"
                      className={`th ${c.className || ''}`}
                      aria-sort={active ? (desc ? 'descending' : 'ascending') : undefined}
                    >
                      {c.sortField && onSort ? (
                        <button type="button" className="inline-flex items-center gap-1 uppercase tracking-wide hover:text-ink" onClick={() => onSort(c.sortField)}>
                          {c.header}
                          {active && (desc ? <ArrowDown className="h-3 w-3" aria-hidden="true" /> : <ArrowUp className="h-3 w-3" aria-hidden="true" />)}
                        </button>
                      ) : (
                        c.header
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-paper-200">
              {rows.map((row, i) => (
                <tr key={rowKey(row) || i} className="hover:bg-paper/60">
                  {columns.map((c) => (
                    <td key={c.key} className={`td ${c.className || ''}`}>
                      {c.render ? c.render(row) : row[c.key] ?? '—'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {onPage && !error && rows.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-paper-200 px-3 py-2.5 text-sm text-ink-soft">
          <span>
            {total !== undefined ? `${total} total · ` : ''}Page {page} of {totalPages}
          </span>
          <div className="flex gap-1">
            <button type="button" className="btn-secondary px-2 py-1" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page">
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </button>
            <button type="button" className="btn-secondary px-2 py-1" disabled={page >= totalPages} onClick={() => onPage(page + 1)} aria-label="Next page">
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
