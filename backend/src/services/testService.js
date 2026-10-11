import { Question } from '../models/Question.js';
import { Test } from '../models/Test.js';
import { Attempt } from '../models/Attempt.js';
import ApiError from '../utils/ApiError.js';
import { ATTEMPT_STATUS, MAX_ATTEMPTS_DEFAULT, MAX_TAB_SWITCHES_DEFAULT, TEST_STATUS } from '../utils/constants.js';
import { isValidObjectId, sample } from '../utils/id.js';

/** Escapes a string so it can be used inside a RegExp safely. */
function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Case-insensitive whole-word match (matches DB values regardless of casing). */
function ciExact(value) {
  return new RegExp(`^${escapeRegex(value)}$`, 'i');
}

/**
 * Builds a test from the question bank.
 * Throws the exact product error when the bank cannot satisfy the request.
 */
export async function generateTest({
  title,
  subject,
  description = '',
  count,
  topics = [],
  difficulties = [],
  durationMinutes = 30,
  negativeMarks = 0,
  passMarks = null,
  shuffle = true,
  isAdaptive = false,
  maxTabSwitches = MAX_TAB_SWITCHES_DEFAULT,
  maxAttempts = MAX_ATTEMPTS_DEFAULT,
  status = TEST_STATUS.DRAFT,
  activeFrom = null,
  activeUntil = null,
  createdBy
}) {
  const filter = { isDeleted: false };
  if (subject) filter.subject = ciExact(subject);
  if (topics?.length) filter.topic = { $in: topics.map(ciExact) };
  if (difficulties?.length) filter.difficulty = { $in: difficulties.map(ciExact) };

  const available = await Question.find(filter).select('_id marks').lean();

  if (available.length < count) {
    throw ApiError.badRequest(
      `Not enough questions available. Requested ${count}, found ${available.length}.`
    );
  }

  const chosen = sample(available, count);
  const questionIds = chosen.map((q) => q._id);
  const totalMarks = chosen.reduce((sum, q) => sum + (q.marks ?? 1), 0);

  const test = await Test.create({
    title,
    subject,
    description,
    durationMinutes,
    questionIds,
    topics,
    difficultyFilter: difficulties,
    totalMarks,
    negativeMarks,
    passMarks,
    shuffle,
    isAdaptive,
    maxTabSwitches,
    maxAttempts,
    status,
    activeFrom,
    activeUntil,
    createdBy: createdBy ?? null
  });

  return test;
}

export function isTestOpenAt(test, now = new Date()) {
  if (test.status !== TEST_STATUS.ACTIVE) return false;
  if (test.activeFrom && now < new Date(test.activeFrom)) return false;
  if (test.activeUntil && now > new Date(test.activeUntil)) return false;
  return true;
}

export function windowState(test, now = new Date()) {
  if (test.status !== TEST_STATUS.ACTIVE) return test.status;
  if (test.activeFrom && now < new Date(test.activeFrom)) return 'scheduled';
  if (test.activeUntil && now > new Date(test.activeUntil)) return 'closed';
  return 'open';
}

/** Student-facing list: active tests inside their window, plus resume state. */
export async function listAvailableTests({ user, subject, page = 1, limit = 20, now = new Date() }) {
  const match = { status: TEST_STATUS.ACTIVE };
  if (subject) match.subject = subject;

  const [tests, total] = await Promise.all([
    Test.find(match)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('createdBy', 'name')
      .lean(),
    Test.countDocuments(match)
  ]);

  const testIds = tests.map((t) => t._id);
  const mine = await Attempt.find({
    userId: user._id,
    testId: { $in: testIds },
    status: { $in: [ATTEMPT_STATUS.IN_PROGRESS, ATTEMPT_STATUS.SUBMITTED] }
  })
    .select('testId status deadlineAt result.percentage autoSubmitted')
    .lean();

  const byTest = new Map();
  const submittedCount = new Map();
  for (const a of mine) {
    const key = String(a.testId);
    if (a.status === ATTEMPT_STATUS.SUBMITTED) submittedCount.set(key, (submittedCount.get(key) ?? 0) + 1);
    const existing = byTest.get(key);
    // Keep the in-progress attempt if there is one, otherwise the latest result.
    if (!existing || a.status === ATTEMPT_STATUS.IN_PROGRESS) byTest.set(key, a);
  }

  const items = tests
    .filter((t) => isTestOpenAt(t, now) || byTest.has(String(t._id)))
    .map((t) => {
      const attempt = byTest.get(String(t._id));
      const state = windowState(t, now);
      const attemptsUsed = submittedCount.get(String(t._id)) ?? 0;
      const maxAttempts = t.maxAttempts ?? 0;
      const extraAttempts = t.extraAttempts?.[String(user._id)] ?? 0;
      // null = unlimited (maxAttempts 0 or unset).
      const attemptsAllowed = maxAttempts > 0 ? maxAttempts + extraAttempts : null;
      const noAttemptsLeft =
        attemptsAllowed !== null && attemptsUsed >= attemptsAllowed && attempt?.status !== ATTEMPT_STATUS.IN_PROGRESS;
      return {
        id: String(t._id),
        title: t.title,
        subject: t.subject,
        description: t.description,
        durationMinutes: t.durationMinutes,
        questionCount: t.questionIds?.length ?? 0,
        totalMarks: t.totalMarks,
        negativeMarks: t.negativeMarks,
        passMarks: t.passMarks,
        maxTabSwitches: t.maxTabSwitches ?? 0,
        maxAttempts,
        extraAttempts,
        attemptsUsed,
        attemptsAllowed,
        noAttemptsLeft,
        status: t.status,
        activeFrom: t.activeFrom,
        activeUntil: t.activeUntil,
        windowState: state,
        isOpen: state === 'open',
        createdBy: t.createdBy?.name ?? null,
        myAttempt: attempt
          ? {
              id: String(attempt._id),
              status: attempt.status,
              deadlineAt: attempt.deadlineAt,
              percentage: attempt.result?.percentage ?? null,
              autoSubmitted: attempt.autoSubmitted
            }
          : null
      };
    });

  return { items, total };
}

export async function getTestForStudent({ testId, now = new Date() }) {
  if (!isValidObjectId(testId)) throw ApiError.badRequest('Invalid test id');
  const test = await Test.findById(testId).populate('createdBy', 'name').lean();
  if (!test) throw ApiError.notFound('Test not found');
  return {
    id: String(test._id),
    title: test.title,
    subject: test.subject,
    description: test.description,
    durationMinutes: test.durationMinutes,
    questionCount: test.questionIds?.length ?? 0,
    totalMarks: test.totalMarks,
    negativeMarks: test.negativeMarks,
    passMarks: test.passMarks,
    maxTabSwitches: test.maxTabSwitches ?? 0,
    maxAttempts: test.maxAttempts ?? 0,
    status: test.status,
    windowState: windowState(test, now),
    isOpen: isTestOpenAt(test, now),
    activeFrom: test.activeFrom,
    activeUntil: test.activeUntil,
    createdBy: test.createdBy?.name ?? null
  };
}

export async function listSubjects() {
  const [subjects, tests] = await Promise.all([
    Question.distinct('subject', { isDeleted: false }),
    Test.distinct('subject')
  ]);
  return [...new Set([...subjects, ...tests])].sort();
}

export function listTopics(subject) {
  const filter = { isDeleted: false };
  if (subject) filter.subject = subject;
  return Question.distinct('topic', filter);
}

/**
 * Groups the live question bank by subject → topic → difficulty with counts.
 * Used by the admin generate form so filters come from real data (no typos).
 */
export async function bankBreakdown() {
  const rows = await Question.aggregate([
    { $match: { isDeleted: false } },
    {
      $group: {
        _id: { subject: '$subject', topic: '$topic', difficulty: '$difficulty' },
        count: { $sum: 1 }
      }
    }
  ]);

  const subjects = new Map();
  for (const row of rows) {
    const { subject = '', topic = '', difficulty = '' } = row._id;
    if (!subjects.has(subject)) subjects.set(subject, { subject, count: 0, topics: new Map() });
    const s = subjects.get(subject);
    s.count += row.count;

    if (!s.topics.has(topic)) {
      s.topics.set(topic, { topic, count: 0, difficulties: { easy: 0, medium: 0, hard: 0 } });
    }
    const t = s.topics.get(topic);
    t.count += row.count;
    if (t.difficulties[difficulty] !== undefined) t.difficulties[difficulty] += row.count;
  }

  return [...subjects.values()]
    .map((s) => ({
      subject: s.subject,
      count: s.count,
      topics: [...s.topics.values()].sort((a, b) => a.topic.localeCompare(b.topic))
    }))
    .sort((a, b) => a.subject.localeCompare(b.subject));
}

export default {
  generateTest,
  listAvailableTests,
  getTestForStudent,
  listSubjects,
  listTopics,
  bankBreakdown,
  isTestOpenAt,
  windowState
};
