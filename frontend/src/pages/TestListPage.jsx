import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { tests } from '../api/endpoints';
import { apiErrorMessage, formatDate } from '../lib/utils';
import { Loader } from '../components/common/Loader';
import { ErrorState } from '../components/common/ErrorState';
import { EmptyState } from '../components/common/EmptyState';
import Pagination from '../components/common/Pagination';
import { notify } from '../components/common/Toast';

const TestListPage = () => {
  const navigate = useNavigate();
  const [subject, setSubject] = useState('');
  const [page, setPage] = useState(1);
  const [busyId, setBusyId] = useState(null);

  const { data: subjectsData } = useQuery({
    queryKey: ['test-subjects'],
    queryFn: tests.subjects
  });

  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: ['tests', subject, page],
    queryFn: () => tests.list({ subject: subject || undefined, page, limit: 20 })
  });

  // Start is idempotent server-side; the button is disabled meanwhile so a
  // double click cannot create two attempts (Rules.md §5).
  const onStart = async (test) => {
    setBusyId(test.id);
    try {
      const started = await tests.start(test.id);
      navigate(`/tests/${test.id}/attempt`, { state: { started } });
    } catch (err) {
      notify(apiErrorMessage(err, 'This test is not currently available.'));
    } finally {
      setBusyId(null);
    }
  };

  if (isPending) return <Loader label="Loading tests…" />;
  if (isError) return <ErrorState message={apiErrorMessage(error)} onRetry={refetch} />;

  const items = data?.items ?? [];
  const subjects = subjectsData?.subjects ?? subjectsData ?? [];

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Available tests</h1>
        <select
          className="select select-bordered w-full max-w-xs"
          value={subject}
          onChange={(e) => {
            setSubject(e.target.value);
            setPage(1);
          }}
          aria-label="Filter by subject"
        >
          <option value="">All subjects</option>
          {(Array.isArray(subjects) ? subjects : []).map((s) => (
            <option key={typeof s === 'string' ? s : s.subject} value={typeof s === 'string' ? s : s.subject}>
              {typeof s === 'string' ? s : s.subject}
            </option>
          ))}
        </select>
      </header>

      {items.length === 0 ? (
        <EmptyState
          title="No tests available"
          description="There are no open tests for this filter right now."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((t) => {
            const attempt = t.myAttempt;
            const canResume = attempt?.id && attempt?.status === 'in_progress';
            const noAttemptsLeft = Boolean(t.noAttemptsLeft) && !canResume;
            return (
              <article key={t.id} className="card bg-base-100 shadow">
                <div className="card-body">
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="card-title text-lg">{t.title}</h2>
                    <span className="badge badge-primary badge-sm">{t.subject}</span>
                  </div>

                  {t.description && <p className="text-sm opacity-70">{t.description}</p>}

                  <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
                    <dt className="opacity-60">Questions</dt>
                    <dd>{t.questionCount}</dd>
                    <dt className="opacity-60">Duration</dt>
                    <dd>{t.durationMinutes} min</dd>
                    <dt className="opacity-60">Marks</dt>
                    <dd>{t.totalMarks}</dd>
                    <dt className="opacity-60">Attempts used</dt>
                    <dd>{t.attemptsAllowed === null ? 'Unlimited' : `${t.attemptsUsed} / ${t.attemptsAllowed}`}</dd>
                    <dt className="opacity-60">Window</dt>
                    <dd className="flex items-center gap-1 text-xs">
                      {formatDate(t.activeFrom)}
                      <ArrowRight size={12} className="shrink-0 opacity-60" aria-hidden="true" />
                      {formatDate(t.activeUntil)}
                    </dd>
                  </dl>

                  {t.maxTabSwitches > 0 && (
                    <p className="text-xs text-warning">
                      Switching tabs may auto-submit your test. Limit: {t.maxTabSwitches}.
                    </p>
                  )}

                  <div className="card-actions mt-2 items-center justify-between">
                    <span className={`badge ${t.isOpen ? 'badge-success' : 'badge-ghost'}`}>
                      {t.isOpen ? 'Open' : t.windowState ?? 'Closed'}
                    </span>
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      disabled={!t.isOpen || busyId === t.id || noAttemptsLeft}
                      onClick={() => onStart(t)}
                    >
                      {busyId === t.id && <span className="loading loading-spinner loading-xs" />}
                      {canResume ? 'Resume' : noAttemptsLeft ? 'No attempts left' : t.attemptsUsed > 0 ? 'Retake' : 'Start'}
                    </button>
                  </div>

                  {attempt?.id && attempt?.status === 'submitted' && (
                    <a className="btn btn-ghost btn-xs" href={`/attempts/${attempt.id}/result`}>
                      View result
                    </a>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      <Pagination page={page} limit={20} total={data?.total ?? 0} onPageChange={setPage} />
    </div>
  );
};

export default TestListPage;