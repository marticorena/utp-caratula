export interface HistoryPaginationProps {
  page: number;
  total: number;
  pageSize: number;
  onChange: (page: number) => void;
}

/** Render pagination controls when history spans multiple pages. */
export function HistoryPagination({
  page,
  total,
  pageSize,
  onChange,
}: HistoryPaginationProps) {
  if (total <= pageSize) return null;
  const pageCount = Math.ceil(total / pageSize);

  return (
    <nav className="history-pagination" aria-label="Páginas del historial">
      <button
        className="secondary-button"
        disabled={page === 0}
        onClick={() => onChange(page - 1)}
      >
        Anterior
      </button>
      <span>{page + 1} / {pageCount}</span>
      <button
        className="secondary-button"
        disabled={page + 1 >= pageCount}
        onClick={() => onChange(page + 1)}
      >
        Siguiente
      </button>
    </nav>
  );
}
