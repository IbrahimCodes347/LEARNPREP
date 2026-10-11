import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { dashboard } from '../api/endpoints';
import { onLeaderboardUpdate } from '../api/socket';
import { apiErrorMessage, formatDate, formatPercent } from '../lib/utils';
import { useAuth } from '../context/AuthContext';
import { Loader } from '../components/common/Loader';
import { ErrorState } from '../components/common/ErrorState';
import { EmptyState } from '../components/common/EmptyState';
import TrendChart from '../components/dashboard/TrendChart';
import WeakTopicsChart from '../components/dashboard/WeakTopicsChart';
import StreakBadge from '../components/dashboard/StreakBadge';

const DashboardPage = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: ['dashboard'],
    queryFn: dashboard.get
  });

  // Live event just invalidates the key, the server owns the payload.
  useEffect(() => {
    const off = onLeaderboardUpdate(() => queryClient.invalidateQueries({ queryKey: ['dashboard'] }));
    return off;
  }, [queryClient]);

  if (isPending) return <Loader label="Loading your dashboard…" />;
  if (isError) return <ErrorState message={apiErrorMessage(error)} onRetry={refetch} />;

  // GET /dashboard -> { student, streak:{count,lastActiveDate}, stats, trend, weakTopics, recent }
  const stats = data?.stats ?? {};
  const streak = data?.streak ?? {};
  const trend = data?.trend ?? [];
  const weakTopics = data?.weakTopics ?? [];
  const recent = data?.recent ?? [];

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Welcome back, {user?.name?.split(' ')[0]}</h1>
          <p className="text-sm opacity-70">Here is how you are doing.</p>
        </div>
        <StreakBadge count={streak.count ?? 0} />
      </header>

      <div className="stats stats-vertical w-full shadow sm:stats-horizontal">
        <div className="stat">
          <div className="stat-title">Tests taken</div>
          <div className="stat-value text-primary">{stats.testsTaken ?? 0}</div>
        </div>
        <div className="stat">
          <div className="stat-title">Average</div>
          <div className="stat-value">{formatPercent(stats.avgPercentage ?? 0)}</div>
        </div>
        <div className="stat">
          <div className="stat-title">Best score</div>
          <div className="stat-value text-success">{formatPercent(stats.bestPercentage ?? 0)}</div>
        </div>
        <div className="stat">
          <div className="stat-title">Pass rate</div>
          <div className="stat-value">{formatPercent(stats.passRate ?? 0)}</div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card bg-base-100 shadow">
          <div className="card-body">
            <h2 className="card-title text-lg">Average score by subject</h2>
            <TrendChart data={trend} />
          </div>
        </section>

        <section className="card bg-base-100 shadow">
          <div className="card-body">
            <h2 className="card-title text-lg">Weak topics</h2>
            <WeakTopicsChart topics={weakTopics} />
          </div>
        </section>
      </div>

      <section className="card bg-base-100 shadow">
        <div className="card-body">
          <h2 className="card-title text-lg">Recent attempts</h2>
          {recent.length === 0 ? (
            <EmptyState
              title="No attempts yet"
              description="Take a test to see your progress here."
              action={
                <Link to="/tests" className="btn btn-primary">
                  Browse tests
                </Link>
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>Test</th>
                    <th>Score</th>
                    <th>Percentage</th>
                    <th>Submitted</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {recent.map((a) => (
                    <tr key={a.id ?? a._id}>
                      <td>{a.testTitle ?? a.title ?? '-'}</td>
                      <td>
                        {a.score ?? a.result?.score ?? '-'} / {a.totalMarks ?? a.result?.totalMarks ?? '-'}
                      </td>
                      <td>{formatPercent(a.percentage ?? a.result?.percentage ?? 0)}</td>
                      <td className="text-sm opacity-70">{formatDate(a.submittedAt)}</td>
                      <td>
                        <Link className="btn btn-sm btn-outline" to={`/attempts/${a.id ?? a._id}/result`}>
                          Result
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  );
};

export default DashboardPage;