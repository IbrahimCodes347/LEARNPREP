import { OPTION_LABELS, formatPercent } from '../../lib/utils';
import { DonutChart, BarChartCard, useChartColors } from '../common/AnalyticsCharts';

const NUMBER_CARDS = [
  { key: 'attempted', label: 'Attempted' },
  { key: 'correct', label: 'Correct' },
  { key: 'wrong', label: 'Wrong' },
  { key: 'skipped', label: 'Skipped' },
  { key: 'accuracy', label: 'Accuracy' }
];

/**
 * GET /admin/analytics/questions/:id/attempts -> { question, rows }.
 * Rows carry the sitter's name/username/rollno from the server; correctness is
 * derived from the question's correctIndex. A student who appears more than once
 * is numbered "Attempt 1", "Attempt 2".
 */
const DrilldownDrawer = ({ open, onClose, question, data }) => {
  const colors = useChartColors();
  const rows = data?.rows ?? [];
  const resolved = data?.question ?? question;
  const correctIndex = resolved?.correctIndex;
  const options = resolved?.options ?? [];

  const attempted = rows.filter((r) => r.selectedIndex !== null && r.selectedIndex !== undefined).length;
  const correct = rows.filter((r) => r.selectedIndex === correctIndex).length;
  const wrong = attempted - correct;
  const skipped = rows.length - attempted;
  const accuracy = attempted > 0 ? (correct / attempted) * 100 : 0;

  const counts = { attempted, correct, wrong, skipped, accuracy };

  // Rows arrive oldest-first, so the Nth row for a student is their Nth attempt.
  const seen = {};
  const attemptNumber = rows.map((r) => {
    seen[r.userId] = (seen[r.userId] ?? 0) + 1;
    return seen[r.userId];
  });
  const attemptsPerStudent = rows.reduce((acc, r) => {
    acc[r.userId] = (acc[r.userId] ?? 0) + 1;
    return acc;
  }, {});

  const donutData = [
    { name: 'Correct', value: correct, color: colors.correct },
    { name: 'Wrong', value: wrong, color: colors.wrong },
    { name: 'Skipped', value: skipped, color: colors.skipped }
  ];

  const distribution = options.map((_, i) => ({
    label: i === correctIndex ? `${OPTION_LABELS[i] ?? '?'} (correct)` : OPTION_LABELS[i] ?? '?',
    count: rows.filter((r) => r.selectedIndex === i).length,
    color: i === correctIndex ? colors.correct : colors.primary
  }));

  return (
    <div className="drawer drawer-end">
      <input id="drilldown-drawer" type="checkbox" className="drawer-toggle" checked={open} readOnly />
      <div className="drawer-side z-50">
        <label htmlFor="drilldown-drawer" aria-label="Close" className="drawer-overlay" onClick={onClose} />
        <div className="min-h-full w-full max-w-md overflow-y-auto bg-base-100 p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold">Who answered this</h3>
            <button type="button" className="btn btn-sm btn-ghost" onClick={onClose}>
              Close
            </button>
          </div>

          {resolved && <p className="mt-2 text-sm opacity-80">{resolved.questionText}</p>}

          {!data ? (
            <p className="mt-6 text-sm opacity-60">Loading…</p>
          ) : rows.length === 0 ? (
            <p className="mt-6 text-sm opacity-60">Nobody has attempted this question yet.</p>
          ) : (
            <div className="mt-4 flex flex-col gap-4">
              <div className="flex flex-wrap gap-2">
                {resolved?.subject && <span className="badge badge-outline">{resolved.subject}</span>}
                {resolved?.topic && <span className="badge badge-outline">{resolved.topic}</span>}
                {resolved?.difficulty && <span className="badge badge-ghost capitalize">{resolved.difficulty}</span>}
              </div>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {NUMBER_CARDS.map((c) => (
                  <div key={c.key} className="rounded-box bg-base-200 p-3">
                    <div className="text-xs opacity-70">{c.label}</div>
                    <div className="text-lg font-semibold">
                      {c.key === 'accuracy' ? formatPercent(counts.accuracy) : counts[c.key]}
                    </div>
                  </div>
                ))}
              </div>

              <div className="max-h-64 overflow-auto rounded-box border border-base-300">
                <table className="table table-sm">
                  <thead>
                    <tr>
                      <th>Student</th>
                      <th>Answer</th>
                      <th>Result</th>
                      <th>Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => {
                      const isCorrect =
                        r.selectedIndex !== null &&
                        r.selectedIndex !== undefined &&
                        r.selectedIndex === correctIndex;
                      return (
                        <tr key={r.attemptId ?? i}>
                          <td>
                            <div className="font-medium">{r.name || 'Deleted student'}</div>
                            {(r.username || r.rollno) && (
                              <div className="text-xs opacity-70">
                                {[r.username, r.rollno].filter(Boolean).join(' / ')}
                              </div>
                            )}
                            {attemptsPerStudent[r.userId] > 1 && (
                              <div className="text-xs opacity-60">Attempt {attemptNumber[i]}</div>
                            )}
                          </td>
                          <td>
                            {r.selectedIndex === null || r.selectedIndex === undefined
                              ? 'Skipped'
                              : `${OPTION_LABELS[r.selectedIndex] ?? '?'}. ${options[r.selectedIndex] ?? ''}`}
                          </td>
                          <td>
                            <span className={`badge badge-sm ${isCorrect ? 'badge-success' : 'badge-error'}`}>
                              {isCorrect ? 'Correct' : r.selectedIndex === null ? 'Skipped' : 'Wrong'}
                            </span>
                          </td>
                          <td className="text-xs">{r.timeSpentSec ?? 0}s</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div>
                <h4 className="text-sm font-semibold">Correct / Wrong / Skipped</h4>
                <DonutChart data={donutData} height={220} />
              </div>

              <div>
                <h4 className="text-sm font-semibold">Options chosen</h4>
                <BarChartCard
                  data={distribution}
                  xKey="label"
                  barKey="count"
                  layout="vertical"
                  color={colors.primary}
                  height={Math.max(160, distribution.length * 44)}
                  tickFormatter={(v) => String(v)}
                  valueFormatter={(v) => String(v)}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DrilldownDrawer;
