import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { admin } from '../api/endpoints';
import { apiErrorMessage, downloadFile, downloadCsv, formatPercent, formatReportDate, formatTime } from '../lib/utils';
import { Loader } from '../components/common/Loader';
import { ErrorState } from '../components/common/ErrorState';
import { EmptyState } from '../components/common/EmptyState';
import DataTable from '../components/common/DataTable';
import Pagination from '../components/common/Pagination';
import ConfirmModal from '../components/common/ConfirmModal';
import { notify } from '../components/common/Toast';
import StudentForm from '../components/admin/StudentForm';
import QuestionForm from '../components/admin/QuestionForm';
import BulkImportModal from '../components/admin/BulkImportModal';
import TestGenerateModal from '../components/admin/TestGenerateModal';
import TestSettingsModal from '../components/admin/TestSettingsModal';
import ExtraAttemptModal from '../components/admin/ExtraAttemptModal';
import ProgressDrawer from '../components/admin/ProgressDrawer';
import DrilldownDrawer from '../components/admin/DrilldownDrawer';
import GradesTab from '../components/admin/GradesTab';
import { DonutChart, BarChartCard, useChartColors, truncate } from '../components/common/AnalyticsCharts';

const TABS = ['Students', 'Questions', 'Tests', 'Analytics', 'Grades', 'Logs'];

const AdminPage = () => {
  const [tab, setTab] = useState('Students');
  const [page, setPage] = useState(1);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Admin</h1>

      <div role="tablist" className="tabs tabs-box w-fit overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t}
            role="tab"
            className={`tab whitespace-nowrap ${tab === t ? 'tab-active' : ''}`}
            onClick={() => {
              setTab(t);
              setPage(1);
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'Students' && <StudentsTab page={page} setPage={setPage} />}
      {tab === 'Questions' && <QuestionsTab page={page} setPage={setPage} />}
      {tab === 'Tests' && <TestsTab />}
      {tab === 'Analytics' && <AnalyticsTab />}
      {tab === 'Grades' && <GradesTab />}
      {tab === 'Logs' && <LogsTab page={page} setPage={setPage} />}
    </div>
  );
};


const StudentsTab = ({ page, setPage }) => {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [grade, setGrade] = useState('');
  const [status, setStatus] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [showImport, setShowImport] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [progressFor, setProgressFor] = useState(null);

  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: ['admin', 'students', page, search, grade, status],
    queryFn: () =>
      admin.listStudents({
        page,
        limit: 20,
        search: search || undefined,
        grade: grade || undefined,
        // API expects status: 'active' | 'inactive' (not isActive=true/false)
        status: status || undefined
      })
  });

  const save = useMutation({
    mutationFn: ({ id, payload }) => (id ? admin.updateStudent(id, payload) : admin.createStudent(payload)),
    onSuccess: () => {
      setShowForm(false);
      setEditing(null);
      queryClient.invalidateQueries({ queryKey: ['admin', 'students'] });
      notify('Student saved.', 'success');
    },
    onError: (err) => notify(apiErrorMessage(err, 'Could not save that student.'))
  });

  const remove = useMutation({
    mutationFn: admin.deleteStudent,
    onSuccess: () => {
      setPendingDelete(null);
      queryClient.invalidateQueries({ queryKey: ['admin', 'students'] });
      notify('Student deleted.', 'success');
    },
    onError: (err) => notify(apiErrorMessage(err, 'Could not delete that student.'))
  });

  const toggleActive = useMutation({
    mutationFn: ({ id, isActive }) => admin.updateStudent(id, { isActive }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'students'] });
      notify('Student updated.', 'success');
    },
    onError: (err) => notify(apiErrorMessage(err, 'Could not update that student.'))
  });

  const bulk = useMutation({
    mutationFn: admin.bulkStudents,
    onSuccess: (res) => {
      setImportResult(res);
      queryClient.invalidateQueries({ queryKey: ['admin'] });
      notify(`Imported ${res?.createdCount ?? 0}, failed ${res?.errorCount ?? 0}.`, 'success');
    },
    onError: (err) => notify(apiErrorMessage(err, 'Import failed.'))
  });

  const progress = useQuery({
    queryKey: ['admin', 'progress', progressFor?._id],
    queryFn: () => admin.studentProgress(progressFor._id),
    enabled: Boolean(progressFor)
  });

  const items = data?.items ?? [];

  const columns = [
    { key: 'name', label: 'Name' },
    { key: 'username', label: 'Username' },
    { key: 'grade', label: 'Class' },
    {
      key: 'isActive',
      label: 'Status',
      render: (r) => (
        <span className={`badge badge-sm ${r.isActive ? 'badge-success' : 'badge-ghost'}`}>
          {r.isActive ? 'Active' : 'Deactivated'}
        </span>
      )
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (r) => (
        <div className="flex gap-1">
          <button type="button" className="btn btn-xs btn-outline" onClick={() => setProgressFor(r)}>
            Progress
          </button>
          <button
            type="button"
            className="btn btn-xs btn-outline"
            onClick={() => {
              setEditing(r);
              setShowForm(true);
            }}
          >
            Edit
          </button>
          <button
            type="button"
            className={`btn btn-xs ${r.isActive ? 'btn-error btn-outline' : 'btn-success btn-outline'}`}
            disabled={toggleActive.isPending}
            onClick={() => toggleActive.mutate({ id: r.id ?? r._id, isActive: !r.isActive })}
          >
            {r.isActive ? 'Deactivate' : 'Activate'}
          </button>
          <button
            type="button"
            className="btn btn-xs btn-error btn-outline"
            onClick={() => setPendingDelete(r.id ?? r._id)}
          >
            Delete
          </button>
        </div>
      )
    }
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <input
          className="input input-bordered w-full max-w-xs"
          placeholder="Search name or username"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <input
          className="input input-bordered w-full max-w-40"
          placeholder="Class"
          value={grade}
          onChange={(e) => setGrade(e.target.value)}
        />
        <select className="select select-bordered" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
          <option value="">All</option>
          <option value="active">Active</option>
          <option value="inactive">Deactivated</option>
        </select>

        <div className="ms-auto flex flex-wrap gap-2">
          <button type="button" className="btn btn-outline btn-sm" onClick={() => downloadFile(admin.exportUrl('students'), 'students.csv')}>
            Export CSV
          </button>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => setShowImport(true)}>
            Bulk import
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setShowForm(true)}>
            Create student
          </button>
        </div>
      </div>

      {isPending ? (
        <Loader />
      ) : isError ? (
        <ErrorState message={apiErrorMessage(error)} onRetry={refetch} />
      ) : items.length === 0 ? (
        <EmptyState title="No students found" description="Adjust the filters or create a student." />
      ) : (
        <>
          <DataTable columns={columns} rows={items} />
          <Pagination page={page} limit={20} total={data?.total ?? 0} onPageChange={setPage} />
        </>
      )}

      <StudentForm
        open={showForm}
        mode={editing ? 'edit' : 'create'}
        initial={
          editing
            ? {
                name: editing.name,
                username: editing.username,
                email: editing.email,
                rollno: editing.rollno,
                grade: editing.grade
              }
            : undefined
        }
        submitting={save.isPending}
        onSubmit={(payload) => save.mutate({ id: editing?.id ?? editing?._id, payload })}
        onClose={() => {
          setShowForm(false);
          setEditing(null);
        }}
      />
      <ConfirmModal
        open={Boolean(pendingDelete)}
        title="Delete student?"
        message="They are hidden from the list and can no longer log in or start tests. Their attempts stay for analytics, and their username, email and roll number stay reserved."
        confirmLabel="Delete"
        tone="error"
        submitting={remove.isPending}
        onConfirm={() => remove.mutate(pendingDelete)}
        onClose={() => setPendingDelete(null)}
      />
      <BulkImportModal
        open={showImport}
        kind="students"
        submitting={bulk.isPending}
        result={importResult}
        onSubmit={(file) => bulk.mutate(file)}
        onClose={() => setShowImport(false)}
      />
      <ProgressDrawer open={Boolean(progressFor)} onClose={() => setProgressFor(null)} student={progressFor} data={progress.data} />
    </div>
  );
};


const QuestionsTab = ({ page, setPage }) => {
  const queryClient = useQueryClient();
  const [subject, setSubject] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [showImport, setShowImport] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);

  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: ['admin', 'questions', page, subject],
    queryFn: () => admin.listQuestions({ page, limit: 20, subject: subject || undefined })
  });

  const save = useMutation({
    mutationFn: ({ id, payload }) => (id ? admin.updateQuestion(id, payload) : admin.createQuestion(payload)),
    onSuccess: () => {
      setShowForm(false);
      setEditing(null);
      queryClient.invalidateQueries({ queryKey: ['admin', 'questions'] });
      notify('Question saved.', 'success');
    },
    onError: (err) => notify(apiErrorMessage(err, 'Could not save that question.'))
  });

  const softDelete = useMutation({
    mutationFn: admin.deleteQuestion,
    onSuccess: () => {
      setPendingDelete(null);
      queryClient.invalidateQueries({ queryKey: ['admin', 'questions'] });
      notify('Question deleted.', 'success');
    },
    onError: (err) => notify(apiErrorMessage(err, 'Could not delete that question.'))
  });

  const restore = useMutation({
    mutationFn: admin.restoreQuestion,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'questions'] }),
    onError: (err) => notify(apiErrorMessage(err, 'Could not restore that question.'))
  });

  const bulk = useMutation({
    mutationFn: admin.bulkQuestions,
    onSuccess: (res) => {
      setImportResult(res);
      queryClient.invalidateQueries({ queryKey: ['admin', 'questions'] });
      notify(`Imported ${res?.createdCount ?? 0}, failed ${res?.errorCount ?? 0}.`, 'success');
    },
    onError: (err) => notify(apiErrorMessage(err, 'Import failed.'))
  });

  const items = data?.items ?? [];

  const columns = [
    { key: 'questionText', label: 'Question', cellClass: 'max-w-md' },
    { key: 'subject', label: 'Subject' },
    { key: 'topic', label: 'Topic' },
    {
      key: 'difficulty',
      label: 'Difficulty',
      render: (r) => (
        <span
          className={`badge badge-sm ${
            r.difficulty === 'hard' ? 'badge-error' : r.difficulty === 'medium' ? 'badge-warning' : 'badge-success'
          }`}
        >
          {r.difficulty}
        </span>
      )
    },
    { key: 'marks', label: 'Marks' },
    {
      key: 'actions',
      label: 'Actions',
      render: (r) => (
        <div className="flex gap-1">
          <button
            type="button"
            className="btn btn-xs btn-outline"
            onClick={() => {
              setEditing(r);
              setShowForm(true);
            }}
          >
            Edit
          </button>
          {r.isDeleted ? (
            <button
              type="button"
              className="btn btn-xs btn-success btn-outline"
              disabled={restore.isPending}
              onClick={() => restore.mutate(r.id ?? r._id)}
            >
              Restore
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-xs btn-error btn-outline"
              onClick={() => setPendingDelete(r.id ?? r._id)}
            >
              Delete
            </button>
          )}
        </div>
      )
    }
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <input
          className="input input-bordered w-full max-w-xs"
          placeholder="Filter by subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
        />
        <div className="ms-auto flex flex-wrap gap-2">
          <button type="button" className="btn btn-outline btn-sm" onClick={() => downloadFile(admin.exportUrl('questions'), 'questions.csv')}>
            Export CSV
          </button>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => setShowImport(true)}>
            Bulk import
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => {
              setEditing(null);
              setShowForm(true);
            }}
          >
            Create question
          </button>
        </div>
      </div>

      {isPending ? (
        <Loader />
      ) : isError ? (
        <ErrorState message={apiErrorMessage(error)} onRetry={refetch} />
      ) : items.length === 0 ? (
        <EmptyState title="No questions found" description="Add questions to the bank first." />
      ) : (
        <>
          <DataTable columns={columns} rows={items} />
          <Pagination page={page} limit={20} total={data?.total ?? 0} onPageChange={setPage} />
        </>
      )}

      <QuestionForm
        open={showForm}
        initial={editing}
        submitting={save.isPending}
        onSubmit={(payload) => save.mutate({ id: editing?.id ?? editing?._id, payload })}
      />
      <BulkImportModal
        open={showImport}
        kind="questions"
        submitting={bulk.isPending}
        result={importResult}
        onSubmit={(file) => bulk.mutate(file)}
        onClose={() => setShowImport(false)}
      />
      <ConfirmModal
        open={Boolean(pendingDelete)}
        title="Delete question?"
        message="It is soft-deleted and hidden from tests. You can restore it afterwards."
        confirmLabel="Delete"
        tone="error"
        submitting={softDelete.isPending}
        onConfirm={() => softDelete.mutate(pendingDelete)}
        onClose={() => setPendingDelete(null)}
      />
    </div>
  );
};


const TestsTab = () => {
  const queryClient = useQueryClient();
  const [showGenerate, setShowGenerate] = useState(false);
  const [editing, setEditing] = useState(null);
  const [granting, setGranting] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);

  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: ['admin', 'tests'],
    queryFn: () => admin.listTests({ page: 1, limit: 50 })
  });

  const generate = useMutation({
    mutationFn: admin.generateTest,
    onSuccess: () => {
      setShowGenerate(false);
      queryClient.invalidateQueries({ queryKey: ['admin', 'tests'] });
      notify('Test generated.', 'success');
    },
    onError: (err) => notify(apiErrorMessage(err, 'Not enough questions available.'))
  });

  const setStatus = useMutation({
    mutationFn: ({ id, status }) => admin.updateTest(id, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'tests'] }),
    onError: (err) => notify(apiErrorMessage(err, 'Could not update that test.'))
  });

  const saveSettings = useMutation({
    mutationFn: ({ id, ...body }) => admin.updateTest(id, body),
    onSuccess: () => {
      setEditing(null);
      queryClient.invalidateQueries({ queryKey: ['admin', 'tests'] });
      notify('Test settings saved.', 'success');
    },
    onError: (err) => notify(apiErrorMessage(err, 'Could not update that test.'))
  });

  const grantExtra = useMutation({
    mutationFn: ({ testId, userId }) => admin.giveExtraAttempt(testId, { userId }),
    onSuccess: () => {
      setGranting(null);
      notify('Extra attempt granted.', 'success');
    },
    onError: (err) => notify(apiErrorMessage(err, 'Could not grant an extra attempt.'))
  });

  const remove = useMutation({
    mutationFn: admin.deleteTest,
    onSuccess: () => {
      setPendingDelete(null);
      queryClient.invalidateQueries({ queryKey: ['admin', 'tests'] });
      notify('Test deleted.', 'success');
    },
    onError: (err) => notify(apiErrorMessage(err, 'Could not delete that test.'))
  });

  const items = data?.items ?? [];

  const columns = [
    { key: 'title', label: 'Title' },
    { key: 'subject', label: 'Subject' },
    { key: 'questionCount', label: 'Questions' },
    { key: 'totalMarks', label: 'Marks' },
    { key: 'durationMinutes', label: 'Duration' },
    { key: 'maxTabSwitches', label: 'Tab limit', render: (r) => r.maxTabSwitches ?? 0 },
    {
      key: 'maxAttempts',
      label: 'Max attempts',
      render: (r) => ((r.maxAttempts ?? 0) > 0 ? r.maxAttempts : 'Unlimited')
    },
    {
      key: 'status',
      label: 'Status',
      render: (r) => (
        <span className={`badge badge-sm ${r.status === 'active' ? 'badge-success' : r.status === 'draft' ? 'badge-warning' : 'badge-ghost'}`}>
          {r.status}
        </span>
      )
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (r) => (
        <div className="flex gap-1">
          {r.status !== 'active' && (
            <button
              type="button"
              className="btn btn-xs btn-success btn-outline"
              disabled={setStatus.isPending}
              onClick={() => setStatus.mutate({ id: r.id ?? r._id, status: 'active' })}
            >
              Activate
            </button>
          )}
          {r.status === 'active' && (
            <button
              type="button"
              className="btn btn-xs btn-outline"
              disabled={setStatus.isPending}
              onClick={() => setStatus.mutate({ id: r.id ?? r._id, status: 'inactive' })}
            >
              Archive
            </button>
          )}
          <button
            type="button"
            className="btn btn-xs btn-outline"
            onClick={() => setEditing(r)}
          >
            Settings
          </button>
          <button
            type="button"
            className="btn btn-xs btn-outline"
            onClick={() => setGranting(r)}
          >
            Extra attempt
          </button>
          <button type="button" className="btn btn-xs btn-error btn-outline" onClick={() => setPendingDelete(r.id ?? r._id)}>
            Delete
          </button>
        </div>
      )
    }
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm opacity-70">Generate a test from the question bank, then activate it.</p>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setShowGenerate(true)}>
          Generate test
        </button>
      </div>

      {isPending ? (
        <Loader />
      ) : isError ? (
        <ErrorState message={apiErrorMessage(error)} onRetry={refetch} />
      ) : items.length === 0 ? (
        <EmptyState title="No tests yet" description="Generate one from the question bank." />
      ) : (
        <DataTable columns={columns} rows={items} />
      )}

      <TestGenerateModal
        open={showGenerate}
        submitting={generate.isPending}
        onSubmit={(payload) => generate.mutate(payload)}
        onClose={() => setShowGenerate(false)}
      />
      <TestSettingsModal
        open={Boolean(editing)}
        test={editing}
        submitting={saveSettings.isPending}
        onSubmit={(payload) => saveSettings.mutate({ id: editing.id ?? editing._id, ...payload })}
        onClose={() => setEditing(null)}
      />
      <ExtraAttemptModal
        open={Boolean(granting)}
        test={granting}
        submitting={grantExtra.isPending}
        onSubmit={(payload) => grantExtra.mutate({ testId: granting.id ?? granting._id, ...payload })}
        onClose={() => setGranting(null)}
      />
      <ConfirmModal
        open={Boolean(pendingDelete)}
        title="Delete test?"
        confirmLabel="Delete"
        tone="error"
        submitting={remove.isPending}
        onConfirm={() => remove.mutate(pendingDelete)}
        onClose={() => setPendingDelete(null)}
      />
    </div>
  );
};


const AnalyticsTab = () => {
  const [drill, setDrill] = useState(null);
  const [page, setPage] = useState(1);
  const colors = useChartColors();

  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: ['admin', 'analytics-questions', page],
    queryFn: () => admin.analyticsQuestions({ page, limit: 20 })
  });

  // The charts summarise the whole bank, not just the current table page.
  const chartQuery = useQuery({
    queryKey: ['admin', 'analytics-charts'],
    queryFn: () => admin.analyticsQuestions({ page: 1, limit: 100 })
  });

  // KPI cards: attempts / average % / pass % come from the class roll-up, which
  // is not paginated and already carries per-class passRate.
  const classesQuery = useQuery({
    queryKey: ['admin', 'analytics-classes'],
    queryFn: () => admin.analyticsClasses()
  });

  const drillData = useQuery({
    queryKey: ['admin', 'analytics-drill', drill?.questionId],
    queryFn: () => admin.analyticsQuestionAttempts(drill.questionId),
    enabled: Boolean(drill)
  });

  const items = data?.items ?? [];
  const chartItems = chartQuery.data?.items ?? [];
  const classes = classesQuery.data?.classes ?? [];

  const classAttempts = classes.reduce((sum, c) => sum + (c.attempts ?? 0), 0);
  const weighted = (key) =>
    classAttempts > 0
      ? classes.reduce((sum, c) => sum + (c[key] ?? 0) * (c.attempts ?? 0), 0) / classAttempts
      : 0;

  const attemptedTotal = chartItems.reduce((sum, q) => sum + (q.attempted ?? 0), 0);
  const avgTimeSec =
    attemptedTotal > 0
      ? chartItems.reduce((sum, q) => sum + (q.avgTimeSec ?? 0) * (q.attempted ?? 0), 0) / attemptedTotal
      : 0;

  const totals = chartItems.reduce(
    (acc, q) => ({
      correct: acc.correct + (q.correct ?? 0),
      wrong: acc.wrong + (q.wrong ?? 0),
      skipped: acc.skipped + (q.skipped ?? 0)
    }),
    { correct: 0, wrong: 0, skipped: 0 }
  );
  const answerTotal = totals.correct + totals.wrong + totals.skipped;

  const donutData = [
    { name: 'Correct', value: totals.correct, color: colors.correct },
    { name: 'Wrong', value: totals.wrong, color: colors.wrong },
    { name: 'Skipped', value: totals.skipped, color: colors.skipped }
  ];

  const bySubject = Object.values(
    chartItems.reduce((acc, q) => {
      const key = q.subject ?? 'Unknown';
      acc[key] ??= { subject: key, attempted: 0, correct: 0 };
      acc[key].attempted += q.attempted ?? 0;
      acc[key].correct += q.correct ?? 0;
      return acc;
    }, {})
  )
    .filter((s) => s.attempted > 0)
    .map((s) => ({ subject: s.subject, accuracy: Math.round((s.correct / s.attempted) * 1000) / 10 }))
    .sort((a, b) => b.accuracy - a.accuracy);

  const hardest = chartItems
    .filter((q) => q.attempted > 0)
    .slice()
    .sort((a, b) => a.accuracy - b.accuracy)
    .slice(0, 5)
    .map((q) => ({ label: truncate(q.questionText), tooltipLabel: q.questionText, accuracy: q.accuracy }));

  const chartsPending = chartQuery.isPending || classesQuery.isPending;

  const columns = [
    { key: 'questionText', label: 'Question', cellClass: 'max-w-sm' },
    { key: 'subject', label: 'Subject' },
    { key: 'attempted', label: 'Attempted' },
    { key: 'correct', label: 'Correct' },
    { key: 'wrong', label: 'Wrong' },
    { key: 'skipped', label: 'Skipped' },
    {
      key: 'accuracy',
      label: 'Accuracy',
      render: (r) => formatPercent(r.accuracy ?? 0)
    },
    { key: 'avgTimeSec', label: 'Avg time' },
    {
      key: 'actions',
      label: '',
      render: (r) => (
        <button
          type="button"
          className="btn btn-xs btn-outline whitespace-nowrap"
          onClick={() => setDrill(r)}
        >
          Drill down
        </button>
      )
    }
  ];

  const onExport = () => {
    downloadCsv(
      items,
      [
        { key: 'questionText', label: 'question' },
        { key: 'subject', label: 'subject' },
        { key: 'topic', label: 'topic' },
        { key: 'attempted', label: 'attempted' },
        { key: 'correct', label: 'correct' },
        { key: 'wrong', label: 'wrong' },
        { key: 'skipped', label: 'skipped' },
        { key: 'accuracy', label: 'accuracy' },
        { key: 'avgTimeSec', label: 'avgTimeSec' }
      ],
      'question-analytics.csv'
    );
  };

  const noData = <p className="py-8 text-center text-sm opacity-60">No attempts yet.</p>;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <button type="button" className="btn btn-outline btn-sm" onClick={onExport} disabled={items.length === 0}>
          Export this page
        </button>
      </div>

      {isPending ? (
        <Loader />
      ) : isError ? (
        <ErrorState message={apiErrorMessage(error)} onRetry={refetch} />
      ) : items.length === 0 ? (
        <EmptyState title="No analytics yet" description="Analytics appear once students submit tests." />
      ) : (
        <>
          <DataTable columns={columns} rows={items} />
          <Pagination page={page} limit={20} total={data?.total ?? 0} onPageChange={setPage} />
        </>
      )}

      <div className="stats stats-vertical w-full bg-base-100 shadow sm:stats-horizontal">
        <div className="stat">
          <div className="stat-title">Total attempts</div>
          <div className="stat-value text-2xl">{classAttempts}</div>
        </div>
        <div className="stat">
          <div className="stat-title">Average score</div>
          <div className="stat-value text-2xl">{formatPercent(weighted('avgPercentage'))}</div>
        </div>
        <div className="stat">
          <div className="stat-title">Pass rate</div>
          <div className="stat-value text-2xl">{formatPercent(weighted('passRate'))}</div>
        </div>
        <div className="stat">
          <div className="stat-title">Average time</div>
          <div className="stat-value text-2xl">{formatTime(avgTimeSec)}</div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card bg-base-100 shadow">
          <div className="card-body">
            <h3 className="card-title text-base">Answer breakdown</h3>
            {chartsPending ? <Loader /> : answerTotal > 0 ? <DonutChart data={donutData} /> : noData}
          </div>
        </div>

        <div className="card bg-base-100 shadow">
          <div className="card-body">
            <h3 className="card-title text-base">Accuracy by subject</h3>
            {chartsPending ? (
              <Loader />
            ) : bySubject.length > 0 ? (
              <BarChartCard
                data={bySubject}
                xKey="subject"
                barKey="accuracy"
                layout="vertical"
                color={colors.primary}
                domain={[0, 100]}
                tickFormatter={(v) => `${v}%`}
                valueFormatter={(v) => `${v}%`}
              />
            ) : (
              noData
            )}
          </div>
        </div>

        <div className="card bg-base-100 shadow lg:col-span-2">
          <div className="card-body">
            <h3 className="card-title text-base">5 hardest questions</h3>
            {chartsPending ? (
              <Loader />
            ) : hardest.length > 0 ? (
              <BarChartCard
                data={hardest}
                xKey="label"
                barKey="accuracy"
                layout="vertical"
                color={colors.wrong}
                domain={[0, 100]}
                tickFormatter={(v) => `${v}%`}
                valueFormatter={(v) => `${v}%`}
              />
            ) : (
              noData
            )}
          </div>
        </div>
      </div>

      <DrilldownDrawer open={Boolean(drill)} onClose={() => setDrill(null)} question={drill} data={drillData.data} />
    </div>
  );
};


const LogsTab = ({ page, setPage }) => {
  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: ['admin', 'attempts', page],
    queryFn: () => admin.attemptLogs({ page, limit: 20 })
  });

  const items = data?.items ?? [];

  // GET /admin/attempts -> items carry nested `user` and `test`, not flat names.
  const columns = [
    { key: 'student', label: 'Student', render: (r) => r.user?.name ?? r.userId ?? '-' },
    { key: 'test', label: 'Test', render: (r) => r.test?.title ?? '-' },
    { key: 'status', label: 'Status' },
    {
      key: 'percentage',
      label: 'Score',
      render: (r) => (r.percentage === undefined || r.percentage === null ? '-' : formatPercent(r.percentage))
    },
    {
      key: 'tabSwitchCount',
      label: 'Tab switches',
      render: (r) => (
        <span className={r.tabSwitchCount > 0 ? 'badge badge-warning badge-sm' : 'badge badge-ghost badge-sm'}>
          {r.tabSwitchCount ?? 0}
        </span>
      )
    },
    {
      key: 'autoSubmitted',
      label: 'Auto-submitted',
      render: (r) => {
        if (!r.autoSubmitted) {
          return <span className="badge badge-ghost badge-sm whitespace-nowrap">Manual</span>;
        }
        const isTabLimit = r.autoSubmitReason === 'tab_switch_limit';
        return (
          <span
            className="badge badge-error badge-sm whitespace-nowrap"
            title={isTabLimit ? 'Auto-submitted: tab switch limit' : 'Auto-submitted: time limit reached'}
          >
            {isTabLimit ? 'Tab limit' : 'Auto-submitted'}
          </span>
        );
      }
    },
    { key: 'submittedAt', label: 'Submitted', cellClass: 'whitespace-nowrap', render: (r) => formatReportDate(r.submittedAt) }
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <button type="button" className="btn btn-outline btn-sm" onClick={() => downloadFile(admin.exportUrl('attempts'), 'attempts.csv')}>
          Export CSV
        </button>
      </div>

      {isPending ? (
        <Loader />
      ) : isError ? (
        <ErrorState message={apiErrorMessage(error)} onRetry={refetch} />
      ) : items.length === 0 ? (
        <EmptyState title="No attempts logged yet" />
      ) : (
        <>
          <DataTable columns={columns} rows={items} />
          <Pagination page={page} limit={20} total={data?.total ?? 0} onPageChange={setPage} />
        </>
      )}
    </div>
  );
};

export default AdminPage;
