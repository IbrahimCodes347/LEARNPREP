import ApiError from '../utils/ApiError.js';
import { ATTEMPT_STATUS } from '../utils/constants.js';
import { Question } from '../models/Question.js';
import { Test } from '../models/Test.js';
import { Attempt } from '../models/Attempt.js';
import { Bookmark } from '../models/Bookmark.js';
import {
  serializeAttempt,
  startAttempt,
  saveAnswer,
  submitAttempt,
  logProctorEvent,
  getOwnedAttempt
} from '../services/attemptService.js';
import { getLeaderboard } from '../services/leaderboardService.js';
import { dashboard as getDashboard } from '../services/analyticsService.js';
import { listAvailableTests, getTestForStudent, listSubjects } from '../services/testService.js';
import { ok, paginated, paginationMeta } from '../utils/response.js';
import { toObjectId } from '../utils/id.js';

export async function listTests(req, res) {
  const { page, limit, subject } = req.query;
  const { items, total } = await listAvailableTests({ user: req.user, subject, page, limit });
  return paginated(res, items, paginationMeta({ page, limit, total }), 'Tests loaded');
}

export async function getTest(req, res) {
  const test = await getTestForStudent({ testId: req.params.id });
  return ok(res, test, 'Test loaded');
}

export async function listSubjectsRoute(req, res) {
  return ok(res, { subjects: await listSubjects() }, 'Subjects loaded');
}

/** Idempotent: repeat calls resume the same attempt. */
export async function start(req, res) {
  const { attempt, resumed, test } = await startAttempt({ user: req.user, testId: req.params.id });
  return ok(
    res,
    {
      ...serializeAttempt(attempt),
      test: {
        id: String(test._id),
        title: test.title,
        subject: test.subject,
        durationMinutes: test.durationMinutes,
        totalMarks: test.totalMarks,
        negativeMarks: test.negativeMarks,
        passMarks: test.passMarks,
        maxTabSwitches: test.maxTabSwitches ?? 0,
        questionCount: test.questionIds.length
      }
    },
    resumed ? 'Attempt resumed' : 'Attempt started'
  );
}

export async function leaderboard(req, res) {
  if (!req.params.id || !/^[a-f\d]{24}$/i.test(req.params.id)) throw ApiError.badRequest('Invalid test id');
  const test = await Test.findById(req.params.id).select('_id').lean();
  if (!test) throw ApiError.notFound('Test not found');

  const board = await getLeaderboard({ testId: test._id, viewerId: req.user._id });
  return ok(res, board, 'Leaderboard loaded');
}

export async function saveAnswerRoute(req, res) {
  const saved = await saveAnswer({
    attemptId: req.params.id,
    user: req.user,
    questionId: req.body.questionId,
    selectedIndex: req.body.selectedIndex ?? null,
    timeSpentSec: req.body.timeSpentSec ?? 0
  });
  return ok(res, saved, 'Answer saved');
}

export async function logEvent(req, res) {
  const result = await logProctorEvent({ attemptId: req.params.id, user: req.user, type: req.body.type });
  return ok(res, result, 'Event recorded');
}

export async function submit(req, res) {
  const { attempt, alreadyFinalized, autoSubmitted } = await submitAttempt({
    attemptId: req.params.id,
    user: req.user
  });
  return ok(
    res,
    { attemptId: String(attempt._id), result: attempt.result ?? null, autoSubmitted, status: attempt.status },
    alreadyFinalized
      ? 'Attempt was already submitted'
      : autoSubmitted
        ? 'Time is up - your test was submitted automatically.'
        : 'Test submitted'
  );
}

export async function result(req, res) {
  const attempt = await getOwnedAttempt({ attemptId: req.params.id, user: req.user, allowAdmin: true });

  if (attempt.status !== ATTEMPT_STATUS.SUBMITTED) {
    throw ApiError.conflict('This attempt has not been submitted yet');
  }

  const test = await Test.findById(attempt.testId)
    .select('title subject durationMinutes negativeMarks passMarks')
    .lean();
  const questions = await Question.find({ _id: { $in: attempt.questionOrder } }).lean();
  const byId = new Map(questions.map((q) => [String(q._id), q]));
  const detail = (attempt.result?.detail ?? []).map((row) => {
    const q = byId.get(String(row.questionId));
    return {
      questionId: row.questionId,
      subject: q?.subject ?? null,
      topic: q?.topic ?? row.topic,
      difficulty: q?.difficulty ?? null,
      questionText: q?.questionText ?? '(question removed)',
      options: q?.options ?? [],
      correctIndex: row.correctIndex,
      selectedIndex: row.selectedIndex,
      isCorrect: row.isCorrect,
      marks: row.marks,
      awarded: row.awarded,
      explanation: q?.explanation ?? ''
    };
  });

  const rank = await rankFor(attempt, req.user);

  return ok(
    res,
    {
      attemptId: String(attempt._id),
      test: test ? { id: String(test._id), ...test } : null,
      status: attempt.status,
      startedAt: attempt.startedAt,
      submittedAt: attempt.submittedAt,
      autoSubmitted: attempt.autoSubmitted,
      tabSwitchCount: attempt.tabSwitchCount ?? 0,
      result: { ...attempt.result, detail },
      rank
    },
    'Result loaded'
  );
}

async function rankFor(attempt, user) {
  const board = await getLeaderboard({ testId: attempt.testId, viewerId: user._id, limit: 100 });
  const me = board.entries.find((e) => String(e.attemptId) === String(attempt._id));
  return { rank: me?.rank ?? null, totalParticipants: board.totalParticipants };
}

export async function report(req, res) {
  const attempt = await getOwnedAttempt({ attemptId: req.params.id, user: req.user, allowAdmin: true });
  if (attempt.status !== ATTEMPT_STATUS.SUBMITTED) {
    throw ApiError.conflict('The report is available once the attempt is submitted');
  }

  const [{ buildResultPdf }, Test2, { User }] = await Promise.all([
    import('../services/pdfService.js'),
    import('../models/Test.js'),
    import('../models/User.js')
  ]);

  const test = await Test2.Test.findById(attempt.testId).lean();
  const owner = attempt.userId?._id ?? attempt.userId;
  const student = await User.findById(owner).lean();

  // Attach option text so the report shows the chosen answer, not "option 3".
  const questions = await Question.find({ _id: { $in: attempt.questionOrder } }).lean();
  const byId = new Map(questions.map((q) => [String(q._id), q]));
  const detail = (attempt.result?.detail ?? []).map((row) => {
    const q = byId.get(String(row.questionId));
    return { ...row, questionText: q?.questionText ?? '', options: q?.options ?? [] };
  });
  const result = { ...(attempt.result ?? {}), detail };

  const { done } = buildResultPdf({
    attempt,
    user: student,
    test: test ?? {},
    result
  });

  const safeName = String(student?.name ?? 'student').replace(/[^\w-]+/g, '_');
  const filename = `learnprep-result-${safeName}-${String(attempt._id).slice(-6)}.pdf`;

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  const buffer = await done;
  return res.send(buffer);
}

export async function myAttempts(req, res) {
  const { page, limit, status, testId } = req.query;
  const filter = { userId: req.user._id };
  // listAttemptsQuery validates both of these; honour them or the filter is a lie.
  if (status) filter.status = status;
  if (testId) filter.testId = testId;
  const [items, total] = await Promise.all([
    Attempt.find(filter)
      .sort({ startedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('testId', 'title subject durationMinutes passMarks negativeMarks totalMarks')
      .lean(),
    Attempt.countDocuments(filter)
  ]);

  return paginated(
    res,
    items.map((a) => ({
      id: String(a._id),
      testId: String(a.testId?._id ?? a.testId),
      testTitle: a.testId?.title ?? 'Deleted test',
      subject: a.testId?.subject ?? null,
      status: a.status,
      startedAt: a.startedAt,
      deadlineAt: a.deadlineAt,
      submittedAt: a.submittedAt,
      autoSubmitted: a.autoSubmitted,
      tabSwitchCount: a.tabSwitchCount ?? 0,
      score: a.result?.score ?? null,
      totalMarks: a.result?.totalMarks ?? null,
      percentage: a.result?.percentage ?? null,
      passed: a.result?.passed ?? null,
      weakTopics: a.result?.weakTopics ?? []
    })),
    paginationMeta({ page, limit, total }),
    'History loaded'
  );
}

/**
 * A question may only be bookmarked once the owner has actually seen it - i.e.
 * it appears in one of their submitted attempts. This prevents students from
 * enumerating question ids to read correctIndex before finishing a test.
 */
async function assertSeenInSubmittedAttempt(userId, questionId) {
  const seen = await Attempt.exists({
    userId,
    status: ATTEMPT_STATUS.SUBMITTED,
    questionOrder: questionId
  });
  if (!seen) throw ApiError.forbidden('You can only bookmark questions from a submitted test');
}

/** Strips answer keys for questions the student has not submitted yet. */
async function seenQuestionIds(userId) {
  // aggregate() does not cast pipeline values, so a string userId would match
  // nothing and leak answer keys for every bookmarked question.
  const rows = await Attempt.aggregate([
    { $match: { userId: toObjectId(userId, 'user id'), status: ATTEMPT_STATUS.SUBMITTED } },
    { $unwind: '$questionOrder' },
    { $group: { _id: '$questionOrder' } },
    { $project: { _id: 0, questionId: { $toString: '$_id' } } }
  ]);
  return new Set(rows.map((r) => r.questionId));
}

export async function listBookmarks(req, res) {
  const { page, limit } = req.query;
  const filter = { userId: req.user._id };
  const [items, total, seen] = await Promise.all([
    Bookmark.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('questionId')
      .lean(),
    Bookmark.countDocuments(filter),
    seenQuestionIds(req.user._id)
  ]);

  return paginated(
    res,
    items
      .filter((b) => b.questionId)
      .map((b) => {
        const reveal = seen.has(String(b.questionId._id));
        return {
          id: String(b._id),
          note: b.note,
          createdAt: b.createdAt,
          question: {
            id: String(b.questionId._id),
            subject: b.questionId.subject,
            topic: b.questionId.topic,
            difficulty: b.questionId.difficulty,
            questionText: b.questionId.questionText,
            options: b.questionId.options,
            ...(reveal
              ? { correctIndex: b.questionId.correctIndex, explanation: b.questionId.explanation }
              : {})
          }
        };
      }),
    paginationMeta({ page, limit, total }),
    'Bookmarks loaded'
  );
}

export async function addBookmark(req, res) {
  const { questionId, note = '' } = req.body;
  const question = await Question.findById(questionId).lean();
  if (!question) throw ApiError.notFound('Question not found');

  await assertSeenInSubmittedAttempt(req.user._id, question._id);

  const doc = await Bookmark.findOneAndUpdate(
    { userId: req.user._id, questionId },
    { $set: { note } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  return ok(res, { id: String(doc._id), questionId: String(question._id), note: doc.note }, 'Bookmark saved');
}

export async function removeBookmark(req, res) {
  const { questionId } = req.params;
  const deleted = await Bookmark.findOneAndDelete({ userId: req.user._id, questionId }).lean();
  if (!deleted) throw ApiError.notFound('Bookmark not found');
  return ok(res, { questionId }, 'Bookmark removed');
}

export async function dashboard(req, res) {
  const data = await getDashboard({ userId: req.user._id, grade: req.user.grade });
  return ok(res, data, 'Dashboard loaded');
}

export default {
  listTests,
  getTest,
  listSubjectsRoute,
  start,
  leaderboard,
  saveAnswerRoute,
  logEvent,
  submit,
  result,
  report,
  myAttempts,
  listBookmarks,
  addBookmark,
  removeBookmark
};
