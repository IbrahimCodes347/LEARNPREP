import { formatDate, formatPercent } from '../../lib/utils';
import { BarChartCard, ScoreTrendChart, useChartColors } from '../common/AnalyticsCharts';

/** GET /admin/students/:id/progress -> { student, summary, trend, topicAccuracy, attempts } */
const ProgressDrawer = ({ open, onClose, student, data }) => {
  const colors = useChartColors();
  const who = data?.student ?? student;
  const summary = data?.summary ?? {};
  const attempts = data?.attempts ?? [];
  const trend = data?.trend ?? [];
  const topicAccuracy = data?.topicAccuracy ?? [];
  // Latest attempt that set a pass mark, drawn as the trend's reference line.
  const passPercentage = trend.reduce(
    (acc, t) => (t.passPercentage === null || t.passPercentage === undefined ? acc : t.passPercentage),
    null
  );

  return (
    <div className="drawer drawer-end">
      <input id="progress-drawer" type="checkbox" className="drawer-toggle" checked={open} readOnly />
      <div className="drawer-side z-50">
        <label htmlFor="progress-drawer" aria-label="Close" className="drawer-overlay" onClick={onClose} />
        <div className="min-h-full w-full max-w-md overflow-y-auto bg-base-100 px-4 py-5">
          <div className="flex items-start justify-between gap-3">
            <h3 className="min-w-0 flex-1 break-words text-lg font-bold">{who?.name ?? 'Student'}</h3>
            <button type="button" className="btn btn-sm btn-ghost shrink-0" onClick={onClose}>
              Close
            </button>
          </div>

          <div className="mt-3 flex flex-wrap gap-2 text-sm">
            {who?.grade && <span className="badge badge-ghost">{who.grade}</span>}
            {who?.username && <span className="badge badge-ghost">{who.username}</span>}
            {who?.rollno && <span className="badge badge-ghost">{who.rollno}</span>}
            {who?.streak?.count > 0 && (
              <span className="badge badge-warning badge-sm">{who.streak.count} day streak</span>
            )}
          </div>

          {!data ? (
            <p className="mt-6 text-sm opacity-60">Loading progress…</p>
          ) : (
            <div className="mt-4 flex flex-col gap-4">
              <div className="stats stats-horizontal w-full shadow">
                <div className="stat py-2">
                  <div className="stat-title text-xs">Attempts</div>
                  <div className="stat-value text-2xl">{summary.tests ?? 0}</div>
                </div>
                <div className="stat py-2">
                  <div className="stat-title text-xs">Average</div>
                  <div className="stat-value text-2xl">{formatPercent(summary.avgPercentage ?? 0)}</div>
                </div>
                <div className="stat py-2">
                  <div className="stat-title text-xs">Best</div>
                  <div className="stat-value text-2xl text-success">{formatPercent(summary.bestPercentage ?? 0)}</div>
                </div>
              </div>

              {(summary.tabSwitches > 0 || summary.autoSubmitted > 0) && (
                <div className="flex flex-wrap gap-2 text-xs">
                  {summary.tabSwitches > 0 && (
                    <span className="badge badge-warning badge-sm">{summary.tabSwitches} tab switches</span>
                  )}
                  {summary.autoSubmitted > 0 && (
                    <span className="badge badge-error badge-sm">{summary.autoSubmitted} auto-submitted</span>
                  )}
                </div>
              )}

              <div>
                <h4 className="mb-1 font-semibold">Recent attempts</h4>
                {attempts.length === 0 ? (
                  <p className="text-sm opacity-60">No submitted tests yet.</p>
                ) : (
                  <ul className="flex flex-col gap-1 text-sm">
                    {attempts.map((a) => (
                      <li key={a.id} className="flex items-center justify-between gap-2">
                        <span className="truncate">{a.testTitle ?? '-'}</span>
                        <span className="shrink-0">
                          {formatPercent(a.percentage ?? 0)} · {formatDate(a.submittedAt)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div>
                <h4 className="mb-1 font-semibold">Score trend</h4>
                {trend.length === 0 ? (
                  <p className="text-sm opacity-60">No submitted tests yet.</p>
                ) : trend.length < 2 ? (
                  <p className="text-sm opacity-60">Need at least 2 attempts to show progress.</p>
                ) : (
                  <ScoreTrendChart data={trend} passPercentage={passPercentage} />
                )}
              </div>

              <div>
                <h4 className="mb-1 font-semibold">Accuracy by topic</h4>
                {topicAccuracy.length === 0 ? (
                  <p className="text-sm opacity-60">No topic data yet.</p>
                ) : (
                  <BarChartCard
                    data={topicAccuracy.map((t) => ({ label: t.topic, accuracy: t.accuracy }))}
                    xKey="label"
                    barKey="accuracy"
                    layout="vertical"
                    color={colors.primary}
                    domain={[0, 100]}
                    height={Math.max(160, topicAccuracy.length * 40)}
                    tickFormatter={(v) => `${v}%`}
                    valueFormatter={(v) => `${v}%`}
                    showValues
                  />
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProgressDrawer;
