import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { bookmarks } from '../api/endpoints';
import { apiErrorMessage, OPTION_LABELS } from '../lib/utils';
import { Loader } from '../components/common/Loader';
import { ErrorState } from '../components/common/ErrorState';
import { EmptyState } from '../components/common/EmptyState';
import Pagination from '../components/common/Pagination';
import ConfirmModal from '../components/common/ConfirmModal';
import { notify } from '../components/common/Toast';

const BookmarksPage = () => {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [pendingDelete, setPendingDelete] = useState(null);

  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: ['bookmarks', page],
    queryFn: () => bookmarks.list({ page, limit: 20 })
  });

  const remove = useMutation({
    mutationFn: (questionId) => bookmarks.remove(questionId),
    onSuccess: () => {
      setPendingDelete(null);
      queryClient.invalidateQueries({ queryKey: ['bookmarks'] });
    },
    onError: (err) => notify(apiErrorMessage(err, 'Could not remove that bookmark.'))
  });

  const items = data?.items ?? [];

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Bookmarks</h1>

      {isPending ? (
        <Loader label="Loading bookmarks…" />
      ) : isError ? (
        <ErrorState message={apiErrorMessage(error)} onRetry={refetch} />
      ) : items.length === 0 ? (
        <EmptyState
          title="No bookmarks yet"
          description="Bookmark a question from a submitted result and it will show up here."
        />
      ) : (
        <div className="flex flex-col gap-4">
          {items.map((b) => {
            const q = b.question ?? {};
            const correct = q.correctIndex;
            return (
              <article key={b.id ?? b.questionId} className="card bg-base-100 shadow">
                <div className="card-body gap-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap gap-2">
                      <span className="badge badge-neutral badge-sm">{q.subject}</span>
                      <span className="badge badge-ghost badge-sm">{q.topic}</span>
                      <span className="badge badge-outline badge-sm">{q.difficulty}</span>
                    </div>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm text-error"
                      onClick={() => setPendingDelete(b.questionId ?? q._id)}
                    >
                      Remove
                    </button>
                  </div>

                  <p className="font-medium">{q.questionText}</p>

                  <ol className="flex flex-col gap-1 text-sm">
                    {(q.options ?? []).map((opt, i) => (
                      <li
                        key={i}
                        className={`rounded px-2 py-1 ${
                          i === correct ? 'bg-success/15 font-semibold' : 'opacity-80'
                        }`}
                      >
                        {OPTION_LABELS[i] ?? i + 1}) {opt}
                        {i === correct && <span className="badge badge-success badge-xs ml-2">correct</span>}
                      </li>
                    ))}
                  </ol>

                  {q.explanation && <p className="text-sm opacity-70">{q.explanation}</p>}
                  {b.note && <p className="text-sm italic opacity-80">Note: {b.note}</p>}
                </div>
              </article>
            );
          })}
        </div>
      )}

      <Pagination page={page} limit={20} total={data?.total ?? 0} onPageChange={setPage} />

      <ConfirmModal
        open={Boolean(pendingDelete)}
        title="Remove bookmark?"
        message="This cannot be undone."
        confirmLabel="Remove"
        tone="error"
        submitting={remove.isPending}
        onConfirm={() => remove.mutate(pendingDelete)}
        onClose={() => setPendingDelete(null)}
      />
    </div>
  );
};

export default BookmarksPage;