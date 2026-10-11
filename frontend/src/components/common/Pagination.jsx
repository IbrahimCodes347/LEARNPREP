/** Server-driven pager; the API caps `limit` at 100 (Rules.md). */
const Pagination = ({ page, limit, total, onPageChange }) => {
  const totalPages = Math.max(1, Math.ceil((total ?? 0) / (limit || 20)));

  if (totalPages <= 1) {
    return total ? <span className="text-sm opacity-70">{total} total</span> : null;
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <span className="text-sm opacity-70">
        {total} total · page {page} of {totalPages}
      </span>
      <div className="join">
        <button
          type="button"
          className="btn join-item btn-sm"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          «
        </button>
        <span className="btn join-item btn-sm pointer-events-none">
          {page} / {totalPages}
        </span>
        <button
          type="button"
          className="btn join-item btn-sm"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          »
        </button>
      </div>
    </div>
  );
};

export default Pagination;