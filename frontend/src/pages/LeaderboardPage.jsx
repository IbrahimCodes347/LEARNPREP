import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Medal } from 'lucide-react';
import { tests } from '../api/endpoints';
import { joinTest, onLeaderboardUpdate } from '../api/socket';
import { useAuth } from '../context/AuthContext';
import { apiErrorMessage, formatDate } from '../lib/utils';
import { Loader } from '../components/common/Loader';
import { ErrorState } from '../components/common/ErrorState';
import { EmptyState } from '../components/common/EmptyState';

const LeaderboardPage = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [testId, setTestId] = useState('');

  const { data: myTests } = useQuery({
    queryKey: ['tests', 'leaderboard'],
    queryFn: () => tests.list({ page: 1, limit: 100 })
  });

  // Default to the first test the student can actually have attempted.
  useEffect(() => {
    if (!testId && myTests?.items?.length) setTestId(myTests.items[0].id);
  }, [myTests, testId]);

  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: ['leaderboard', testId],
    queryFn: () => tests.leaderboard(testId),
    enabled: Boolean(testId)
  });

  // Server emits leaderboard:update after a finalize; we only refetch.
  useEffect(() => {
    const off = onLeaderboardUpdate(() =>
      queryClient.invalidateQueries({ queryKey: ['leaderboard', testId] })
    );
    return off;
  }, [testId, queryClient]);

  // Only a submitted attempt grants a room; the server ignores it otherwise.
  useEffect(() => {
    if (testId) joinTest(testId);
  }, [testId]);

  const testOptions = myTests?.items ?? [];
  const entries = data?.entries ?? [];

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Leaderboard</h1>
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="select select-bordered w-full max-w-xs"
            value={testId}
            onChange={(e) => setTestId(e.target.value)}
            aria-label="Choose a test"
          >
            <option value="">Select a test</option>
            {testOptions.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
          {/* Manual refresh keeps the page usable if the socket drops (PRD NFR). */}
          <button type="button" className="btn btn-outline btn-sm" onClick={() => refetch()} disabled={!testId}>
            Refresh
          </button>
        </div>
      </header>

      {!testId ? (
        <EmptyState title="Pick a test" description="Choose a test to see its leaderboard." />
      ) : isPending ? (
        <Loader label="Loading leaderboard…" />
      ) : isError ? (
        <ErrorState message={apiErrorMessage(error)} onRetry={refetch} />
      ) : entries.length === 0 ? (
        <EmptyState
          title="No submissions yet"
          description="The leaderboard fills up once students submit this test."
        />
      ) : (
        <div className="overflow-x-auto rounded-box bg-base-100 shadow">
          <table className="table">
            <thead>
              <tr>
                <th>Rank</th>
                <th>Student</th>
                <th>Score</th>
                <th>Percentage</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => {
                const isMe = e.userId === user?.id || e.userId === user?._id;
                return (
                  <tr key={e.userId ?? e.rank} className={isMe ? 'bg-primary/10 font-semibold' : ''}>
                    <td>
                      <span className="inline-flex items-center gap-1.5">
                        {e.rank <= 3 && <Medal size={14} className="text-warning" aria-hidden="true" />}
                        {e.rank}
                      </span>
                    </td>
                    <td>{e.name ?? e.username ?? '-'}</td>
                    <td>
                      {e.score} / {e.totalMarks}
                    </td>
                    <td>{Number(e.percentage ?? 0).toFixed(2)}%</td>
                    <td className="text-sm opacity-70">{formatDate(e.submittedAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default LeaderboardPage;