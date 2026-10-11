import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { admin } from '../../api/endpoints';
import { apiErrorMessage, downloadCsv, formatDate, formatPercent } from '../../lib/utils';
import { Loader } from '../common/Loader';
import { ErrorState } from '../common/ErrorState';
import { EmptyState } from '../common/EmptyState';
import Pagination from '../common/Pagination';
import { BarChartCard, DonutChart, ScoreTrendChart, useChartColors } from '../common/AnalyticsCharts';

const PAGE_SIZE = 20;

const passBadgeClass = (rate) => (rate >= 60 ? 'badge-success' : rate >= 40 ? 'badge-warning' : 'badge-error');
const levelBadgeClass = (level) =>
  level === 'attention' ? 'badge-error' : level === 'watch' ? 'badge-warning' : 'badge-success';

/** 300 ms debounce so a search keystroke does not fire a request per char. */
function useDebounced(value, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

const TrendArrow = ({ trend }) => {
  if (trend === 'up') return <span className="text-success" aria-label="Improving from last attempt">↑</span>;
  if (trend === 'down') return <span className="text-error" aria-label="Declining from last attempt">↓</span>;
  if (trend === 'flat') return <span className="opacity-60" aria-label="Flat from last attempt">→</span>;
  return <span className="opacity-40">—</span>;
};

/** Expanded row: score trend with the fixed pass bar, history table and recommendation. */
const StudentHistoryRow = ({ student, passPercentage }) => {
  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: ['admin', 'student-history', student.userId],
    queryFn: () => admin.studentHistory(student.userId)
  });

  if (isPending) return <Loader />;
  if (isError) return <ErrorState message={apiErrorMessage(error)} onRetry={refetch} />;

  const history = data?.history ?? [];
  if (history.length === 0) return <p className="text-sm opacity-60">No submitted attempts yet.</p>;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
      <div className="lg:col-span-3">
        <ScoreTrendChart
          data={history.map((h) => ({ percentage: h.percentage }))}
          passPercentage={passPercentage}
          height={200}
        />
      </div>
      <div className="lg:col-span-2 flex flex-col gap-2">
        <p className="text-sm opacity-80">{student.recommendation?.message}</p>
        <div className="overflow-x-auto">
          <table className="table table-sm">
            <thead>
              <tr>
                <th>#</th>
                <th>Test</th>
                <th>Score</th>
                <th>When</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.attempt}>
                  <td>{h.attempt}</td>
                  <td className="max-w-40 truncate" title={h.testTitle}>
                    {h.testTitle}
                  </td>
                  <td className={h.percentage >= passPercentage ? 'text-success' : 'text-error'}>
                    {formatPercent(h.percentage)}
                  </td>
                  <td className="opacity-70">{formatDate(h.submittedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

const SORTABLE = [
  { key: 'name', label: 'Student' },
  { key: 'rollno', label: 'Roll No' },
  { key: 'attemptsCount', label: 'Attempts' },
  { key: 'avgPercentage', label: 'Avg %' },
  { key: 'bestPercentage', label: 'Best %' },
  { key: 'lastPercentage', label: 'Last %' },
  { key: 'status', label: 'Status' },
  { key: 'lastAttemptAt', label: 'Last attempt' }
];

const GradesTab = () => {
  const [grade, setGrade] = useState('');
  const [rawSearch, setRawSearch] = useState('');
  const search = useDebounced(rawSearch);
  const [status, setStatus] = useState('');
  const [sortBy, setSortBy] = useState('avgPercentage');
  const [sortDir, setSortDir] = useState('desc');
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState(null);
  const colors = useChartColors();

  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: ['admin', 'student-report', grade, page, search, status, sortBy, sortDir],
    queryFn: () =>
      admin.studentReport({
        page,
        limit: PAGE_SIZE,
        grade: grade || undefined,
        search: search || undefined,
        status: status || undefined,
        sortBy,
        sortDir
      })
  });

  // Keep every class ever returned so the filter stays useful while typing.
  const classesRef = useRef(new Map());
  useEffect(() => {
    for (const c of data?.classes ?? []) classesRef.current.set(c.grade, c);
  }, [data?.classes]);
  const classOptions = [...classesRef.current.values()];

  const students = data?.students ?? [];
  const summary = data?.summary ?? {};
  const charts = data?.charts ?? { passFail: { passed: 0, failed: 0 }, scoreDistribution: [], avgPerClass: [] };
  const passPercentage = data?.passPercentage ?? 20;
  const total = data?.total ?? 0;

  const resetPage = (fn) => (e) => {
    fn(e.target.value);
    setPage(1);
    setExpanded(null);
  };

  const toggleSort = (key) => {
    if (key === sortBy) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(key);
      setSortDir(['name', 'rollno', 'username'].includes(key) ? 'asc' : 'desc');
    }
    setPage(1);
  };

  const onExport = () => {
    downloadCsv(
      students.map((s) => ({
        name: s.name,
        username: s.username,
        rollno: s.rollno,
        grade: s.grade,
        attempts: s.attemptsCount,
        avgPercentage: s.avgPercentage,
        bestPercentage: s.bestPercentage,
        lastPercentage: s.lastPercentage,
        status: s.status,
        trend: s.trend ?? '',
        lastAttemptAt: s.lastAttemptAt ?? '',
        weakTopics: (s.weakTopics ?? []).join(' | '),
        recommendation: s.recommendation?.level ?? ''
      })),
      [
        { key: 'name', label: 'name' },
        { key: 'username', label: 'username' },
        { key: 'rollno', label: 'rollno' },
        { key: 'grade', label: 'class' },
        { key: 'attempts', label: 'attempts' },
        { key: 'avgPercentage', label: 'avgPercentage' },
        { key: 'bestPercentage', label: 'bestPercentage' },
        { key: 'lastPercentage', label: 'lastPercentage' },
        { key: 'status', label: 'status' },
        { key: 'trend', label: 'trend' },
        { key: 'lastAttemptAt', label: 'lastAttemptAt' },
        { key: 'weakTopics', label: 'weakTopics' },
        { key: 'recommendation', label: 'recommendation' }
      ],
      'student-report.csv'
    );
  };

  const donutData = [
    { name: 'Passed', value: summary.passedCount ?? 0, color: colors.correct },
    { name: 'Failed', value: summary.failedCount ?? 0, color: colors.wrong }
  ];

  return (
    <div className="flex flex-col gap-4" aria-label="Student report">
      <div className="flex flex-wrap items-center gap-2">
        <select
          className="select select-bordered select-sm w-full max-w-56"
          aria-label="Filter by class"
          value={grade}
          onChange={resetPage(setGrade)}
        >
          <option value="">All classes</option>
          {classOptions.map((c) => (
            <option key={c.grade} value={c.grade}>
              {c.grade} ({c.students})
            </option>
          ))}
        </select>
        <input
          className="input input-bordered input-sm w-full max-w-xs"
          placeholder="Search name, username or roll no"
          value={rawSearch}
          onChange={resetPage(setRawSearch)}
        />
        <select
          className="select select-bordered select-sm"
          aria-label="Filter by pass status"
          value={status}
          onChange={resetPage(setStatus)}
        >
          <option value="">All results</option>
          <option value="passed">Passed</option>
          <option value="failed">Failed</option>
        </select>

        <div className="ms-auto flex flex-wrap gap-2">
          <button type="button" className="btn btn-outline btn-sm" onClick={onExport} disabled={students.length === 0}>
            Export CSV
          </button>
        </div>
      </div>

      {isPending ? (
        <Loader />
      ) : isError ? (
        <ErrorState message={apiErrorMessage(error)} onRetry={refetch} />
      ) : (
        <>
          <div className="stats stats-vertical w-full shadow sm:stats-horizontal" aria-label="Class summary">
            <div className="stat">
              <div className="stat-title">Students</div>
              <div className="stat-value text-xl">{summary.studentsCount ?? 0}</div>
            </div>
            <div className="stat">
              <div className="stat-title">Attempts</div>
              <div className="stat-value text-xl">{summary.attemptsCount ?? 0}</div>
            </div>
            <div className="stat">
              <div className="stat-title">Average</div>
              <div className="stat-value text-xl">{formatPercent(summary.avgPercentage ?? 0)}</div>
            </div>
            <div className="stat">
              <div className="stat-title">Pass rate (avg ≥ {passPercentage}%)</div>
              <div className={`stat-value text-xl ${passBadgeClass(summary.passRate ?? 0)}`}>
                {formatPercent(summary.passRate ?? 0)}
              </div>
            </div>
            <div className="stat">
              <div className="stat-title">At risk</div>
              <div className={`stat-value text-xl ${(summary.atRiskCount ?? 0) > 0 ? 'text-error' : ''}`}>
                {summary.atRiskCount ?? 0}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <div className="card bg-base-200/50 p-3" aria-label="Passed vs failed">
              <h4 className="mb-2 text-sm font-semibold">Passed vs failed</h4>
              <DonutChart data={donutData} height={260} />
            </div>
            <div className="card bg-base-200/50 p-3" aria-label="Score distribution by student average">
              <h4 className="mb-2 text-sm font-semibold">Students by average score</h4>
              {(charts.scoreDistribution ?? []).length > 0 ? (
                <BarChartCard
                  data={charts.scoreDistribution}
                  xKey="range"
                  barKey="students"
                  color={colors.primary}
                  height={260}
                  valueFormatter={(v) => (v > 0 ? v : '')}
                  labelPosition="insideTop"
                  labelFill="var(--color-base-100)"
                />
              ) : (
                <p className="py-8 text-center text-sm opacity-60">No data yet.</p>
              )}
            </div>
            <div className="card bg-base-200/50 p-3" aria-label="Average percentage per class">
              <h4 className="mb-2 text-sm font-semibold">Average % per class</h4>
              {!grade && (charts.avgPerClass ?? []).length > 0 ? (
                <BarChartCard
                  data={charts.avgPerClass}
                  xKey="grade"
                  barKey="avgPercentage"
                  layout="vertical"
                  color={colors.primary}
                  domain={[0, 100]}
                  height={260}
                  valueFormatter={(v) => formatPercent(v)}
                  tickFormatter={(v) => `${Math.round(v)}%`}
                  labelPosition="insideEnd"
                  labelFill="var(--color-base-100)"
                />
              ) : (
                <p className="py-8 text-center text-sm opacity-60">
                  Pick “All classes” to compare classes.
                </p>
              )}
            </div>
          </div>

          {students.length === 0 ? (
            <EmptyState title="No students match" description="Search and status narrow the table; pick another class." />
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="table">
                  <thead>
                    <tr>
                      <th aria-label="expand"></th>
                      {SORTABLE.map((c) => (
                        <th key={c.key}>
                          {sortBy === c.key ? (
                            <button
                              type="button"
                              className="font-semibold"
                              onClick={() => toggleSort(c.key)}
                              aria-label={`Sort by ${c.label} ${sortDir === 'asc' ? 'ascending, click to reverse' : 'descending, click to reverse'}`}
                            >
                              {c.label} {sortDir === 'asc' ? '↑' : '↓'}
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="font-semibold opacity-70"
                              onClick={() => toggleSort(c.key)}
                              aria-label={`Sort by ${c.label}`}
                            >
                              {c.label}
                            </button>
                          )}
                        </th>
                      ))}
                      <th>Grade</th>
                      <th aria-label="trend">Trend</th>
                      <th>Weak topics</th>
                      <th>Recommendation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {students.map((s) => {
                      const isOpen = expanded === s.userId;
                      const level = s.recommendation?.level;
                      return [
                        <tr key={s.userId} className={isOpen ? 'bg-base-200/60' : ''}>
                          <td className="w-10">
                            <button
                              type="button"
                              className="btn btn-ghost btn-xs"
                              aria-label={`Show history for ${s.name}`}
                              aria-expanded={isOpen}
                              onClick={() => setExpanded(isOpen ? null : s.userId)}
                            >
                              {isOpen ? '▾' : '▸'}
                            </button>
                          </td>
                          <td>
                            <div className="font-medium">{s.name}</div>
                            <div className="text-xs opacity-60">@{s.username ?? '—'}</div>
                          </td>
                          <td className="opacity-70">{s.rollno || '—'}</td>
                          <td>{s.attemptsCount}</td>
                          <td className="font-medium">{formatPercent(s.avgPercentage)}</td>
                          <td>{formatPercent(s.bestPercentage)}</td>
                          <td>{s.lastPercentage === null ? '—' : formatPercent(s.lastPercentage)}</td>
                          <td>
                            <span className={`badge badge-sm ${s.status === 'passed' ? 'badge-success' : 'badge-error'}`}>
                              {s.status}
                            </span>
                          </td>
                          <td className="opacity-70">{s.lastAttemptAt ? formatDate(s.lastAttemptAt) : '—'}</td>
                          <td className="opacity-70">{s.grade}</td>
                          <td>
                            <TrendArrow trend={s.trend} />
                          </td>
                          <td>
                            {s.weakTopics?.length ? (
                              <div className="flex flex-wrap gap-1">
                                {s.weakTopics.map((t) => (
                                  <span key={t} className="badge badge-ghost badge-sm">
                                    {t}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span className="opacity-40">—</span>
                            )}
                          </td>
                          <td>
                            <span className={`badge badge-sm ${levelBadgeClass(level)}`}>{level ?? 'on_track'}</span>
                          </td>
                        </tr>,
                        isOpen && (
                          <tr key={`${s.userId}-history`}>
                            <td colSpan={13} className="bg-base-200/40 p-4">
                              <StudentHistoryRow student={s} passPercentage={passPercentage} />
                            </td>
                          </tr>
                        )
                      ];
                    })}
                  </tbody>
                </table>
              </div>

              <Pagination page={page} limit={PAGE_SIZE} total={total} onPageChange={setPage} />

              <p className="text-sm opacity-60">
                A student passes when their average across submitted attempts is at least {passPercentage}% (the pass
                bar is fixed). Search and status only narrow the table rows below; the summary and charts always
                reflect the selected class (or the whole student body with “All classes”).
              </p>
            </>
          )}
        </>
      )}
    </div>
  );
};

export default GradesTab;