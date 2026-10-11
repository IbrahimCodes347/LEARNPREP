import { Attempt } from '../models/Attempt.js';
import { Question } from '../models/Question.js';
import { Test } from '../models/Test.js';
import { User } from '../models/User.js';
import ApiError from '../utils/ApiError.js';
import { ROLES, UNASSIGNED_GRADE, gradeNormalizeExpr, normalizeGrade } from '../utils/constants.js';
import { isValidObjectId } from '../utils/id.js';
import { ok, created, paginated, paginationMeta } from '../utils/response.js';
import {
  importQuestions,
  importStudents,
  buildCsv,
  CSV_TEMPLATES,
  SAMPLE_ROWS
} from '../services/importService.js';
import { generateTest, listTopics, listSubjects, bankBreakdown, windowState } from '../services/testService.js';
import {
  attemptLogs,
  classStats,
  dashboard,
  questionAnalytics,
  questionDetailStats,
  studentHistory,
  studentProgress,
  studentReport
} from '../services/analyticsService.js';

export async function listStudents(req, res) {
  const { page, limit, search, grade, status } = req.query;
  // Soft-deleted students are hidden from the list and from search.
  const filter = { role: ROLES.STUDENT, isDeleted: { $ne: true } };

  // The grade filter matches the NORMALISED class, so a canonical value like
  // "TYCS Sem V" also finds legacy "TYCS SEM V" / "tycs" spam, and the same
  // dropdown list used by the Grades tab works here.
  if (grade) {
    const wanted = normalizeGrade(grade) ?? UNASSIGNED_GRADE;
    filter.$expr = { $eq: [gradeNormalizeExpr('$grade'), wanted] };
  }
  if (status === 'active') filter.isActive = true;
  if (status === 'inactive') filter.isActive = false;
  if (search) {
    const rx = new RegExp(escapeRegex(search), 'i');
    filter.$or = [{ name: rx }, { username: rx }, { email: rx }, { rollno: rx }];
  }

  const [users, total] = await Promise.all([
    User.find(filter)
      .select('-passwordHash')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    User.countDocuments(filter)
  ]);

  return paginated(res, users, paginationMeta({ page, limit, total }), 'Students loaded');
}

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const IDENTIFIER_LABELS = { username: 'Username', email: 'Email', rollno: 'Roll number' };

/**
 * Edit-time uniqueness check that names the offending field. The create path
 * keeps its generic 409, so this is only used by updateStudent.
 */
async function assertIdentifiersFree(fields, excludeId) {
  for (const [field, value] of Object.entries(fields)) {
    if (value === undefined || value === null) continue;
    const clash = await User.exists({ [field]: value, _id: { $ne: excludeId } });
    if (clash) throw ApiError.badRequest(`${IDENTIFIER_LABELS[field]} is already in use`);
  }
}

/** Maps a raw E11000 (race on save) to the same field-naming 400. */
function duplicateIdentifierError(err) {
  const field = Object.keys(err.keyPattern ?? err.keyValue ?? {})[0];
  const label = IDENTIFIER_LABELS[field];
  return ApiError.badRequest(label ? `${label} is already in use` : 'That value is already in use');
}

export async function createStudent(req, res) {
  const { name, username, email, rollno, password, grade, isActive } = req.body;

  const conflict = await User.findOne({
    $or: [...(username ? [{ username }] : []), ...(email ? [{ email }] : []), ...(rollno ? [{ rollno }] : [])]
  }).select('_id');
  if (conflict) throw ApiError.conflict('That username, email or roll number is already in use');

  const user = new User({
    name,
    username,
    email,
    rollno,
    grade,
    isActive,
    role: ROLES.STUDENT, // schema rejects `role` from the body
    createdBy: req.user._id
  });
  await user.setPassword(password);

  try {
    await user.save();
  } catch (err) {
    if (err.code === 11000) throw ApiError.conflict('That username, email or roll number is already in use');
    throw err;
  }

  return created(res, { student: user.toPublic() }, 'Student created');
}

export async function updateStudent(req, res) {
  const { id } = req.params;
  if (!isValidObjectId(id)) throw ApiError.badRequest('Invalid student id');

  const { name, username, email, rollno, grade, isActive, password } = req.body;

  const user = await User.findById(id).select('+passwordHash');
  if (!user) throw ApiError.notFound('Student not found');
  if (user.role === ROLES.ADMIN)
    throw ApiError.forbidden('Use the admin seed script to manage admin accounts');
  // The admin who is signed in must not lock themselves out.
  if (isActive === false && String(user._id) === String(req.user._id))
    throw ApiError.badRequest('You cannot deactivate your own account');

  await assertIdentifiersFree({ username, email, rollno }, user._id);

  if (name !== undefined) user.name = name;
  if (username !== undefined) user.username = username;
  if (email !== undefined) user.email = email;
  if (rollno !== undefined) user.rollno = rollno;
  if (grade !== undefined) user.grade = grade;
  if (isActive !== undefined) user.isActive = isActive;
  if (password !== undefined) await user.setPassword(password);

  try {
    await user.save();
  } catch (err) {
    if (err.code === 11000) throw duplicateIdentifierError(err);
    throw err;
  }

  return ok(res, { student: user.toPublic() }, 'Student updated');
}

export async function deleteStudent(req, res) {
  const { id } = req.params;
  if (!isValidObjectId(id)) throw ApiError.badRequest('Invalid student id');
  const user = await User.findById(id);
  if (!user) throw ApiError.notFound('Student not found');
  if (user.role === ROLES.ADMIN) throw ApiError.forbidden('Admin accounts cannot be deleted here');
  if (String(user._id) === String(req.user._id))
    throw ApiError.badRequest('You cannot delete your own account');

  // Soft delete: the row stays so its username/email/roll number remain
  // reserved (never reusable) and its attempts survive for analytics and the
  // leaderboard. isDeleted blocks login, new test starts, and open sessions.
  user.isDeleted = true;
  user.isActive = false;
  await user.save();
  return ok(res, { id, isDeleted: true }, 'Student deleted');
}

export async function bulkImportStudents(req, res) {
  if (!req.file) throw ApiError.badRequest('Attach a .csv or .json file in the "file" field');
  const result = await importStudents({
    buffer: req.file.buffer,
    filename: req.file.originalname,
    createdBy: req.user._id
  });
  return ok(res, result, `Imported ${result.createdCount} of ${result.total} rows`);
}

export function importTemplates(req, res) {
  const kind = req.params.kind === 'questions' ? 'questions' : 'students';
  return ok(res, { header: CSV_TEMPLATES[kind], sampleRows: SAMPLE_ROWS[kind] }, 'Template loaded');
}

export async function studentProgressRoute(req, res) {
  const { id } = req.params;
  if (!isValidObjectId(id)) throw ApiError.badRequest('Invalid student id');
  const student = await User.findById(id).select('name username rollno grade isActive streak').lean();
  if (!student) throw ApiError.notFound('Student not found');

  const progress = await studentProgress({ userId: id, limit: req.query.limit ?? 20 });
  return ok(res, { student, ...progress }, 'Progress loaded');
}

export async function listQuestions(req, res) {
  const { page, limit, subject, topic, difficulty, search, deleted } = req.query;
  const filter = {};

  if (deleted === 'true') filter.isDeleted = true;
  else filter.isDeleted = false;

  if (subject) filter.subject = subject;
  if (topic) filter.topic = topic;
  if (difficulty) filter.difficulty = difficulty;
  if (search) {
    const rx = new RegExp(escapeRegex(search), 'i');
    filter.$or = [{ questionText: rx }, { topic: rx }];
  }

  const [items, total] = await Promise.all([
    Question.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('createdBy', 'name')
      .lean(),
    Question.countDocuments(filter)
  ]);

  return paginated(res, items, paginationMeta({ page, limit, total }), 'Questions loaded');
}

export async function createQuestion(req, res) {
  const question = await Question.create({ ...req.body, createdBy: req.user._id });
  return created(res, { question }, 'Question created');
}

export async function updateQuestion(req, res) {
  const { id } = req.params;
  if (!isValidObjectId(id)) throw ApiError.badRequest('Invalid question id');

  const question = await Question.findById(id);
  if (!question) throw ApiError.notFound('Question not found');

  Object.entries(req.body).forEach(([key, value]) => {
    if (value !== undefined) question[key] = value;
  });

  if (req.body.options && req.body.correctIndex === undefined) {
    throw ApiError.badRequest('Changing the options also requires a new correctIndex');
  }

  await question.save();
  return ok(res, { question }, 'Question updated');
}

export async function softDeleteQuestion(req, res) {
  const { id } = req.params;
  if (!isValidObjectId(id)) throw ApiError.badRequest('Invalid question id');
  const question = await Question.findByIdAndUpdate(id, { isDeleted: true }, { new: true });
  if (!question) throw ApiError.notFound('Question not found');
  return ok(res, { question }, 'Question deleted');
}

export async function restoreQuestion(req, res) {
  const { id } = req.params;
  if (!isValidObjectId(id)) throw ApiError.badRequest('Invalid question id');
  const question = await Question.findByIdAndUpdate(id, { isDeleted: false }, { new: true });
  if (!question) throw ApiError.notFound('Question not found');
  return ok(res, { question }, 'Question restored');
}

export async function bulkImportQuestions(req, res) {
  if (!req.file) throw ApiError.badRequest('Attach a .csv or .json file in the "file" field');
  const result = await importQuestions({
    buffer: req.file.buffer,
    filename: req.file.originalname,
    createdBy: req.user._id
  });
  return ok(res, result, `Imported ${result.createdCount} of ${result.total} rows`);
}

export async function bankMeta(req, res) {
  const subject = req.query.subject || undefined;
  const [subjects, topics] = await Promise.all([listSubjects(), listTopics(subject)]);
  return ok(res, { subjects, topics }, 'Bank metadata loaded');
}

export async function bankBreakdownRoute(req, res) {
  return ok(res, { subjects: await bankBreakdown() }, 'Question bank loaded');
}

export async function listAdminTests(req, res) {
  const { page, limit, status, subject } = req.query;
  const filter = {};
  if (status) filter.status = status;
  if (subject) filter.subject = subject;

  const [items, total, counts] = await Promise.all([
    Test.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('createdBy', 'name')
      .lean(),
    Test.countDocuments(filter),
    Test.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }])
  ]);

  const byStatus = Object.fromEntries(counts.map((c) => [c._id, c.n]));

  return paginated(
    res,
    items.map((t) => ({
      id: String(t._id),
      title: t.title,
      subject: t.subject,
      description: t.description,
      durationMinutes: t.durationMinutes,
      questionCount: t.questionIds?.length ?? 0,
      totalMarks: t.totalMarks,
      negativeMarks: t.negativeMarks,
      passMarks: t.passMarks,
      shuffle: t.shuffle,
      isAdaptive: t.isAdaptive,
      maxTabSwitches: t.maxTabSwitches ?? 0,
      maxAttempts: t.maxAttempts ?? 0,
      status: t.status,
      windowState: windowState(t),
      activeFrom: t.activeFrom,
      activeUntil: t.activeUntil,
      createdBy: t.createdBy?.name ?? null,
      createdAt: t.createdAt
    })),
    { ...paginationMeta({ page, limit, total }), counts: { draft: 0, active: 0, inactive: 0, ...byStatus } },
    'Tests loaded'
  );
}

export async function createTest(req, res) {
  const test = await generateTest({ ...req.body, createdBy: req.user._id });
  return created(res, { test }, 'Test generated');
}

export async function updateTest(req, res) {
  const { id } = req.params;
  if (!isValidObjectId(id)) throw ApiError.badRequest('Invalid test id');

  const test = await Test.findById(id);
  if (!test) throw ApiError.notFound('Test not found');

  if (
    req.body.activeFrom &&
    req.body.activeUntil &&
    new Date(req.body.activeUntil) <= new Date(req.body.activeFrom)
  ) {
    throw ApiError.badRequest('activeUntil must be after activeFrom');
  }

  Object.entries(req.body).forEach(([key, value]) => {
    if (value !== undefined) test[key] = value;
  });

  await test.save();
  return ok(res, { test }, 'Test updated');
}

export async function deleteTest(req, res) {
  const { id } = req.params;
  if (!isValidObjectId(id)) throw ApiError.badRequest('Invalid test id');
  const test = await Test.findByIdAndDelete(id);
  if (!test) throw ApiError.notFound('Test not found');

  const questionIds = test.questionIds ?? [];
  if (questionIds.length) {
    const stillReferenced = await Test.distinct('questionIds', { questionIds: { $in: questionIds } });
    const referenced = new Set(stillReferenced.map(String));
    const exclusiveIds = questionIds.filter((qid) => !referenced.has(String(qid)));
    if (exclusiveIds.length) await Question.deleteMany({ _id: { $in: exclusiveIds } });
  }

  return ok(res, { test }, 'Test deleted');
}

/** Grants one more attempt for one student on one test (see startAttempt). */
export async function giveExtraAttempt(req, res) {
  const { id } = req.params;
  const { userId } = req.body;
  if (!isValidObjectId(id)) throw ApiError.badRequest('Invalid test id');

  const test = await Test.findById(id);
  if (!test) throw ApiError.notFound('Test not found');

  const student = await User.findOne({ _id: userId, role: ROLES.STUDENT }).select('_id').lean();
  if (!student) throw ApiError.notFound('Student not found');

  const key = String(userId);
  test.extraAttempts.set(key, (test.extraAttempts.get(key) ?? 0) + 1);
  await test.save();

  return ok(res, { testId: id, userId: key, extraAttempts: test.extraAttempts.get(key) }, 'Extra attempt granted');
}

export async function analyticsQuestions(req, res) {
  const { page, limit, testId, subject, topic, difficulty } = req.query;
  const { items, total } = await questionAnalytics({ testId, subject, topic, difficulty, page, limit });
  return paginated(res, items, paginationMeta({ page, limit, total }), 'Analytics loaded');
}

export async function analyticsQuestionAttempts(req, res) {
  const { id } = req.params;
  if (!isValidObjectId(id)) throw ApiError.badRequest('Invalid question id');
  const question = await Question.findById(id).lean();
  if (!question) throw ApiError.notFound('Question not found');

  const rows = await questionDetailStats(id);
  return ok(res, { question, rows: rows.slice(0, req.query.limit ?? 50) }, 'Question attempts loaded');
}

export async function analyticsClassStats(req, res) {
  const stats = await classStats({ grade: req.query.grade });
  return ok(res, stats, 'Class stats loaded');
}

export async function studentReportRoute(req, res) {
  const { page, limit, grade, testId, search, status, sortBy, sortDir } = req.query;
  const data = await studentReport({ grade, testId, search, status, sortBy, sortDir, page, limit });
  return ok(res, data, 'Student report loaded');
}

export async function studentHistoryRoute(req, res) {
  const { id } = req.params;
  if (!isValidObjectId(id)) throw ApiError.badRequest('Invalid student id');
  const data = await studentHistory({ userId: id });
  if (!data) throw ApiError.notFound('Student not found');
  return ok(res, data, 'Student history loaded');
}

export async function attemptLogsRoute(req, res) {
  const { page, limit, testId, autoSubmitted, hasTabSwitches, status } = req.query;
  const { items, total } = await attemptLogs({ page, limit, testId, autoSubmitted, hasTabSwitches, status });

  return paginated(
    res,
    items.map((a) => ({
      id: String(a._id),
      user: a.userId ? { id: String(a.userId._id), name: a.userId.name, grade: a.userId.grade } : null,
      test: a.testId ? { id: String(a.testId._id), title: a.testId.title, subject: a.testId.subject } : null,
      status: a.status,
      startedAt: a.startedAt,
      submittedAt: a.submittedAt,
      autoSubmitted: a.autoSubmitted,
      autoSubmitReason: a.autoSubmitReason ?? null,
      tabSwitchCount: a.tabSwitchCount ?? 0,
      events: a.events ?? [],
      score: a.result?.score ?? null,
      percentage: a.result?.percentage ?? null
    })),
    paginationMeta({ page, limit, total }),
    'Attempt logs loaded'
  );
}

export async function dashboardRoute(req, res) {
  const data = await dashboard({ userId: req.user._id, grade: req.user.grade });
  return ok(res, data, 'Dashboard loaded');
}

export async function adminDashboard(req, res) {
  const [students, activeStudents, tests, attempts] = await Promise.all([
    User.countDocuments({ role: ROLES.STUDENT }),
    User.countDocuments({ role: ROLES.STUDENT, isActive: true }),
    Test.countDocuments(),
    Attempt.countDocuments({ status: 'submitted' })
  ]);
  return ok(
    res,
    { stats: { students, activeStudents, tests, submittedAttempts: attempts } },
    'Admin stats loaded'
  );
}

export async function exportStudentsCsv(req, res) {
  const users = await User.find({ role: ROLES.STUDENT }).select('-passwordHash').lean();
  const csv = buildCsv({
    columns: ['name', 'username', 'email', 'rollno', 'grade', 'isActive', 'createdAt'],
    rows: users.map((u) => ({
      ...u,
      // Normalised so legacy case/whitespace variants export as the class they merge into.
      grade: normalizeGrade(u.grade) ?? '',
      isActive: u.isActive ? 'yes' : 'no'
    }))
  });
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="learnprep-students.csv"');
  return res.send(csv);
}

export async function exportAttemptsCsv(req, res) {
  const attempts = await Attempt.find({})
    .sort({ startedAt: -1 })
    .limit(2000)
    .populate('userId', 'name rollno')
    .populate('testId', 'title')
    .lean();
  const csv = buildCsv({
    columns: [
      'student',
      'rollno',
      'test',
      'status',
      'startedAt',
      'submittedAt',
      'autoSubmitted',
      'tabSwitchCount',
      'score',
      'percentage'
    ],
    rows: attempts.map((a) => ({
      student: a.userId?.name ?? '',
      rollno: a.userId?.rollno ?? '',
      test: a.testId?.title ?? '',
      status: a.status,
      startedAt: a.startedAt,
      submittedAt: a.submittedAt,
      autoSubmitted: a.autoSubmitted ? 'yes' : 'no',
      tabSwitchCount: a.tabSwitchCount ?? 0,
      score: a.result?.score ?? '',
      percentage: a.result?.percentage ?? ''
    }))
  });
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="learnprep-attempts.csv"');
  return res.send(csv);
}

export async function exportQuestionsCsv(req, res) {
  const questions = await Question.find({}).lean();
  const csv = buildCsv({
    columns: [
      'subject',
      'topic',
      'difficulty',
      'questionText',
      'options',
      'correctIndex',
      'marks',
      'explanation',
      'isDeleted'
    ],
    rows: questions.map((q) => ({ ...q, options: (q.options ?? []).join('|') }))
  });
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="learnprep-questions.csv"');
  return res.send(csv);
}

export default {
  listStudents,
  createStudent,
  updateStudent,
  deleteStudent,
  bulkImportStudents,
  importTemplates,
  studentProgressRoute,
  listQuestions,
  createQuestion,
  updateQuestion,
  softDeleteQuestion,
  restoreQuestion,
  bulkImportQuestions,
  bankMeta,
  bankBreakdownRoute,
  listAdminTests,
  createTest,
  updateTest,
  deleteTest,
  giveExtraAttempt,
  analyticsQuestions,
  analyticsQuestionAttempts,
  analyticsClassStats,
  studentReportRoute,
  studentHistoryRoute,
  attemptLogsRoute,
  dashboardRoute,
  adminDashboard,
  exportStudentsCsv,
  exportAttemptsCsv,
  exportQuestionsCsv
};
