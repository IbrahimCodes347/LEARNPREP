import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Bookmark } from 'lucide-react';
import { attempts, bookmarks } from '../api/endpoints';
import {
  apiErrorMessage,
  downloadFile,
  formatPercent,
  formatReportDate,
  formatTime,
  OPTION_LABELS
} from '../lib/utils';
import { Loader } from '../components/common/Loader';
import { ErrorState } from '../components/common/ErrorState';
import { notify } from '../components/common/Toast';

const answerLabel = (index, options) => {
  if (index === null || index === undefined) return '-';
  const label = OPTION_LABELS[index] ?? String(index + 1);
  const text = options?.[index];
  return text ? `${label}. ${text}` : label;
};

const ResultPage = () => {
  const { attemptId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState('summary');

  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: ['attempt-result', attemptId],
    queryFn: () => attempts.result(attemptId)
  });

  const toggleBookmark = useMutation({
    mutationFn: (questionId) => bookmarks.add({ questionId }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['bookmarks'] }),
    onError: (err) => notify(apiErrorMessage(err, 'Could not bookmark that question.'))
  });

  if (isPending) return <Loader label="Loading your result…" />;
  if (isError) return <ErrorState message={apiErrorMessage(error)} onRetry={refetch} />;

  // GET /attempts/:id/result -> { attemptId, test, status, submittedAt, result, rank }
  const result = data?.result ?? {};
  const detail = result.detail ?? [];
  const testId = data?.test?.id;
  const submitted = data?.submittedAt;
  const started = data?.startedAt;
  const rank = data?.rank;
  const timeTaken = started && submitted ? (new Date(submitted) - new Date(started)) / 1000 : null;

  const details = [
    ['Test', data?.test?.title ?? '-'],
    ['Subject', data?.test?.subject ?? '-'],
    ['Submitted at', formatReportDate(submitted)],
    ['Time taken', timeTaken === null ? '-' : formatTime(timeTaken)],
    ['Rank', rank?.rank ? `#${rank.rank} of ${rank.totalParticipants ?? '-'}` : '-']
  ];

  const onDownload = async () => {
    try {
      await downloadFile(attempts.reportUrl(attemptId), `learnprep-report-${attemptId}.pdf`);
    } catch {
      notify('Could not download the PDF report.');
    }
  };

  const radial = Math.min(100, Math.max(0, Number(result.percentage ?? 0)));
  const scoreTone =
    result.passed === null
      ? 'bg-neutral text-neutral-content'
      : result.passed
        ? 'bg-success text-success-content'
        : 'bg-error text-error-content';

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Result</h1>
        <div className="flex gap-2">
          {testId && (
            <Link className="btn btn-outline btn-sm" to="/leaderboard">
              View leaderboard
            </Link>
          )}
          <button type="button" className="btn btn-primary btn-sm" onClick={onDownload}>
            Download PDF
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => navigate('/tests')}>
            Back to tests
          </button>
        </div>
      </header>

      <div role="tablist" className="tabs tabs-box w-fit">
        <button
          role="tab"
          className={`tab ${tab === 'summary' ? 'tab-active' : ''}`}
          onClick={() => setTab('summary')}
        >
          Summary
        </button>
        <button
          role="tab"
          className={`tab ${tab === 'review' ? 'tab-active' : ''}`}
          onClick={() => setTab('review')}
        >
          Review ({detail.length})
        </button>
      </div>

      {tab === 'summary' && (
        <div className="flex flex-col gap-6">
          <section className="card bg-base-100 shadow">
            <div className="card-body items-center gap-5 text-center">
              <div
                className={`radial-progress ${result.passed === false ? 'text-error' : 'text-success'}`}
                style={{ '--value': radial, '--size': '9rem' }}
                role="progressbar"
                aria-valuenow={radial}
                aria-label="Percentage scored"
              >
                <span className="font-semibold text-2xl">{formatPercent(result.percentage ?? 0)}</span>
              </div>

              <div className={`rounded-box px-8 py-3 ${scoreTone}`}>
                <p className="text-3xl font-bold">
                  {result.score ?? 0} / {result.totalMarks ?? 0}
                </p>
                <p className="text-sm opacity-90">
                  {result.passed === null ? 'No pass mark set' : result.passed ? 'Passed' : 'Failed'}
                </p>
              </div>
            </div>
          </section>

          <section className="card bg-base-100 shadow">
            <div className="card-body">
              <h2 className="card-title text-lg">Details</h2>
              <div className="overflow-x-auto">
                <table className="table table-sm">
                  <tbody>
                    {details.map(([key, value]) => (
                      <tr key={key}>
                        <th className="w-40">{key}</th>
                        <td>{value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          <div className="stats stats-vertical w-full shadow sm:stats-horizontal">
            <div className="stat">
              <div className="stat-title">Correct</div>
              <div className="stat-value text-success">{result.correct ?? 0}</div>
            </div>
            <div className="stat">
              <div className="stat-title">Wrong</div>
              <div className="stat-value text-error">{result.wrong ?? 0}</div>
            </div>
            <div className="stat">
              <div className="stat-title">Unattempted</div>
              <div className="stat-value">{result.unattempted ?? 0}</div>
            </div>
          </div>

          <section className="card bg-base-100 shadow">
            <div className="card-body">
              <h2 className="card-title text-lg">Weak topics</h2>
              {(result.weakTopics ?? []).length === 0 ? (
                <p className="text-sm opacity-70">No weak topics detected.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {(result.weakTopics ?? []).map((t) => (
                    <span key={t} className="badge badge-warning">
                      {t}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>
      )}

      {tab === 'review' && (
        <section className="card bg-base-100 shadow">
          <div className="card-body">
            <h2 className="card-title text-lg">Per-question review</h2>
            {detail.length === 0 ? (
              <p className="text-sm opacity-70">No per-question detail available.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="table table-sm">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Topic</th>
                      <th>Your answer</th>
                      <th>Correct answer</th>
                      <th>Result</th>
                      <th>Marks</th>
                      <th className="sr-only">Bookmark</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.map((d, i) => {
                      const skipped = d.selectedIndex === null || d.selectedIndex === undefined;
                      const badge = d.isCorrect ? 'badge-success' : skipped ? 'badge-ghost' : 'badge-error';
                      const verdict = d.isCorrect ? 'Correct' : skipped ? 'Not attempted' : 'Wrong';
                      return (
                        <tr key={d.questionId ?? i} title={d.questionText}>
                          <td>{i + 1}</td>
                          <td>{d.topic ?? '-'}</td>
                          <td>{answerLabel(d.selectedIndex, d.options)}</td>
                          <td>{answerLabel(d.correctIndex, d.options)}</td>
                          <td>
                            <span className={`badge badge-sm ${badge}`}>{verdict}</span>
                          </td>
                          <td>
                            {d.awarded ?? 0}/{d.marks ?? 1}
                          </td>
                          <td>
                            <button
                              type="button"
                              className="btn btn-ghost btn-xs"
                              aria-label={`Bookmark question ${i + 1}`}
                              disabled={toggleBookmark.isPending}
                              onClick={() => toggleBookmark.mutate(d.questionId)}
                            >
                              <Bookmark size={14} aria-hidden="true" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
};

export default ResultPage;
