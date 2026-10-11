import { Attempt } from '../models/Attempt.js';
import { Question } from '../models/Question.js';
import { Test } from '../models/Test.js';
import { User } from '../models/User.js';
import ApiError from '../utils/ApiError.js';
import {
  ATTEMPT_STATUS,
  AUTO_SUBMIT_REASONS,
  GRACE_SECONDS,
  PROCTOR_EVENTS,
  ROLES,
  TAB_SWITCH_DEDUPE_MS,
  TEST_STATUS
} from '../utils/constants.js';
import { dayKey, isValidObjectId, shuffle } from '../utils/id.js';
import { createLogger } from '../utils/logger.js';
import { scoreAttempt } from './scoreService.js';
import { emailEnabled, sendResultEmail } from './emailService.js';
import { averagePercentInSubject, filterPoolForBand, loadQuestions, pickBand } from './adaptiveService.js';

const log = createLogger('attempt');

const DEADLINE = 'deadlineAt';

function graceDeadline(deadlineAt) {
  return new Date(new Date(deadlineAt).getTime() + GRACE_SECONDS * 1000);
}

export function isPastDeadline(attempt, now = new Date()) {
  return now > graceDeadline(attempt[DEADLINE]);
}

/** Strips answer keys before the attempt is submitted. Difficulty is also
 * withheld so it cannot be read on the student's test-taking screen. */
export function publicQuestion(q) {
  return {
    _id: String(q._id),
    subject: q.subject,
    topic: q.topic,
    questionText: q.questionText,
    options: q.options,
    marks: q.marks
  };
}

export function serializeAttempt(attempt, { includeKeys = false } = {}) {
  const questions = (attempt.questionOrder ?? []).map((q) => {
    const base = q && q.questionText ? publicQuestion(q) : { _id: String(q) };
    if (includeKeys) {
      base.correctIndex = q.correctIndex;
      base.explanation = q.explanation ?? '';
    }
    return base;
  });

  return {
    id: String(attempt._id),
    testId: String(attempt.testId?._id ?? attempt.testId),
    status: attempt.status,
    startedAt: attempt.startedAt,
    deadlineAt: attempt.deadlineAt,
    submittedAt: attempt.submittedAt,
    autoSubmitted: attempt.autoSubmitted,
    tabSwitchCount: attempt.tabSwitchCount ?? 0,
    serverTime: new Date(),
    questions,
    responses: (attempt.responses ?? []).map((r) => ({
      questionId: String(r.questionId),
      selectedIndex: r.selectedIndex ?? null,
      timeSpentSec: r.timeSpentSec ?? 0,
      savedAt: r.savedAt
    }))
  };
}

/**
 * Idempotent start/resume. Returns the same in-progress attempt on repeat calls
 * and never creates a second one for the same (user, test).
 */
export async function startAttempt({ user, testId, now = new Date() }) {
  if (!isValidObjectId(testId)) throw ApiError.badRequest('Invalid test id');

  if (!user.isActive || user.isDeleted) throw ApiError.forbidden('Your account has been deactivated');

  const test = await Test.findById(testId).lean();
  if (!test) throw ApiError.notFound('Test not found');

  const existing = await Attempt.findOne({
    userId: user._id,
    testId: test._id,
    status: ATTEMPT_STATUS.IN_PROGRESS
  }).populate({ path: 'questionOrder', select: '-correctIndex -explanation' });

  if (existing) {
    if (now < new Date(existing.deadlineAt)) {
      return { attempt: existing, resumed: true, test };
    }
    // Expired but never finalized (cron lag / offline): finalize then fall through.
    try {
      await finalizeAttempt({ attemptId: existing._id, auto: true, emit: false });
    } catch (err) {
      log.error('Failed to finalize expired attempt', existing._id, err.message);
    }
  }

  if (
    test.status !== TEST_STATUS.ACTIVE ||
    !(test.activeFrom && test.activeUntil ? isWithinWindow(test, now) : true)
  ) {
    throw ApiError.forbidden('This test is not currently available.');
  }

  // Attempt cap: completed attempts count against maxAttempts plus any admin
  // grants. 0 (or a missing field on a pre-existing test) means unlimited. The
  // resume path above already returned for a live attempt, so this only gates a
  // fresh start.
  const limit = test.maxAttempts > 0 ? test.maxAttempts + (test.extraAttempts?.[String(user._id)] ?? 0) : 0;
  if (limit > 0) {
    const used = await Attempt.countDocuments({
      userId: user._id,
      testId: test._id,
      status: ATTEMPT_STATUS.SUBMITTED
    });
    if (used >= limit) throw ApiError.forbidden('You Already attempted this test before.');
  }

  if (test.questionIds.length === 0) throw ApiError.conflict('This test has no questions yet');

  let pool = test.questionIds.map((id) => String(id));
  let band = null;

  if (test.isAdaptive) {
    const { average } = await averagePercentInSubject(user._id, test.subject);
    band = pickBand(average, { hasHistory: average !== null });
    const poolDocs = await Question.find({ _id: { $in: pool }, isDeleted: false })
      .select('_id difficulty')
      .lean();
    const filtered = filterPoolForBand(poolDocs, band, pool.length).map((q) => String(q._id));
    if (filtered.length) pool = filtered;
  }

  const questionOrder = test.shuffle ? shuffle(pool) : pool;

  const attemptDoc = {
    userId: user._id,
    testId: test._id,
    status: ATTEMPT_STATUS.IN_PROGRESS,
    startedAt: now,
    deadlineAt: new Date(now.getTime() + test.durationMinutes * 60 * 1000),
    questionOrder,
    responses: questionOrder.map((qid) => ({ questionId: qid, selectedIndex: null, timeSpentSec: 0 })),
    tabSwitchCount: 0,
    events: [],
    result: { band }
  };

  try {
    const created = await Attempt.create(attemptDoc);
    const hydrated = await Attempt.findById(created._id).populate({
      path: 'questionOrder',
      select: '-correctIndex -explanation'
    });
    return { attempt: hydrated, resumed: false, test };
  } catch (err) {
    // Partial unique index caught a concurrent start (double click / two tabs).
    if (err?.code === 11000) {
      const winner = await Attempt.findOne({
        userId: user._id,
        testId: test._id,
        status: ATTEMPT_STATUS.IN_PROGRESS
      }).populate({ path: 'questionOrder', select: '-correctIndex -explanation' });
      if (winner) return { attempt: winner, resumed: true, test };
    }
    throw err;
  }
}

function isWithinWindow(test, now) {
  if (test.activeFrom && now < new Date(test.activeFrom)) return false;
  if (test.activeUntil && now > new Date(test.activeUntil)) return false;
  return true;
}

export async function getOwnedAttempt({ attemptId, user, allowAdmin = false }) {
  if (!isValidObjectId(attemptId)) throw ApiError.badRequest('Invalid attempt id');
  const attempt = await Attempt.findById(attemptId).lean();
  if (!attempt) throw ApiError.notFound('Attempt not found');

  const isOwner = String(attempt.userId?._id ?? attempt.userId) === String(user._id);
  const isAdmin = user.role === ROLES.ADMIN;
  if (!isOwner && !(allowAdmin && isAdmin)) throw ApiError.forbidden('Not your attempt');
  return attempt;
}

/**
 * Saves one answer using a positional update so concurrent saves never
 * overwrite each other. Rejects writes after the deadline + grace.
 */
export async function saveAnswer({
  attemptId,
  user,
  questionId,
  selectedIndex = null,
  timeSpentSec = 0,
  now = new Date()
}) {
  const attempt = await getOwnedAttempt({ attemptId, user });
  if (attempt.status !== ATTEMPT_STATUS.IN_PROGRESS) {
    throw ApiError.conflict('This attempt has already been submitted');
  }
  if (now > graceDeadline(attempt.deadlineAt)) {
    throw ApiError.badRequest('Time is up - answers can no longer be saved');
  }

  const question = await Question.findById(questionId).select('options isDeleted').lean();
  if (!question) throw ApiError.notFound('Question not found');
  // Compare against the canonical id from the database: callers may pass a hex
  // string, an ObjectId, or a populated Question (startAttempt hydrates one).
  const questionIdHex = String(question._id);
  if (!attempt.questionOrder.some((id) => String(id) === questionIdHex)) {
    throw ApiError.badRequest('This question does not belong to the attempt');
  }
  if (selectedIndex !== null && (selectedIndex < 0 || selectedIndex >= question.options.length)) {
    throw ApiError.badRequest('Selected option is out of range');
  }

  const updated = await Attempt.updateOne(
    { _id: attempt._id, status: ATTEMPT_STATUS.IN_PROGRESS },
    {
      $set: {
        'responses.$[r].selectedIndex': selectedIndex,
        'responses.$[r].timeSpentSec': timeSpentSec,
        'responses.$[r].savedAt': now
      }
    },
    { arrayFilters: [{ 'r.questionId': question._id }] }
  );

  if (updated.matchedCount === 0) throw ApiError.conflict('This attempt has already been submitted');

  return { questionId: String(question._id), selectedIndex, savedAt: now };
}

export async function logProctorEvent({
  attemptId,
  user,
  type = PROCTOR_EVENTS.TAB_SWITCH,
  now = new Date()
}) {
  const attempt = await getOwnedAttempt({ attemptId, user });
  if (attempt.status !== ATTEMPT_STATUS.IN_PROGRESS) {
    throw ApiError.conflict('This attempt has already been submitted');
  }
  if (now > graceDeadline(attempt.deadlineAt)) {
    throw ApiError.badRequest('Time is up - events can no longer be recorded');
  }

  // Collapse the duplicate a browser fires when both visibilitychange and blur
  // fire for a single hide - the second event inside the window is not counted.
  const since = new Date(now.getTime() - TAB_SWITCH_DEDUPE_MS);
  const updated = await Attempt.updateOne(
    {
      _id: attempt._id,
      status: ATTEMPT_STATUS.IN_PROGRESS,
      events: { $not: { $elemMatch: { type, at: { $gt: since } } } }
    },
    { $push: { events: { type, at: now } }, $inc: { tabSwitchCount: 1 } }
  );

  if (updated.matchedCount === 0) {
    // Either submitted while we were writing, or a duplicate inside the window.
    const current = await Attempt.findById(attempt._id).select('status tabSwitchCount').lean();
    if (!current || current.status === ATTEMPT_STATUS.SUBMITTED) {
      throw ApiError.conflict('This attempt has already been submitted');
    }
    return { tabSwitchCount: current.tabSwitchCount ?? 0, autoSubmitted: false };
  }

  const fresh = await Attempt.findById(attempt._id).select('tabSwitchCount').lean();
  const count = fresh?.tabSwitchCount ?? 0;

  // The effective limit is the test's stored value: 0 (or a never-set field on
  // a pre-existing test) means detection only, never an auto-submit.
  const test = await Test.findById(attempt.testId).select('maxTabSwitches').lean();
  const limit = test?.maxTabSwitches ?? 0;
  if (limit > 0 && count >= limit) {
    await finalizeAttempt({
      attemptId: attempt._id,
      auto: true,
      reason: AUTO_SUBMIT_REASONS.TAB_SWITCH_LIMIT
    });
    return {
      tabSwitchCount: count,
      autoSubmitted: true,
      reason: AUTO_SUBMIT_REASONS.TAB_SWITCH_LIMIT,
      status: ATTEMPT_STATUS.SUBMITTED
    };
  }

  return { tabSwitchCount: count, autoSubmitted: false };
}

/**
 * Single source of truth for finalization - used by manual submit and by the
 * cron job. Idempotent: a second call returns the stored result untouched.
 */
export async function finalizeAttempt({ attemptId, auto = false, emit = true, reason = null } = {}) {
  const attempt = await Attempt.findById(attemptId).lean();
  if (!attempt) throw ApiError.notFound('Attempt not found');
  if (attempt.status === ATTEMPT_STATUS.SUBMITTED) return { attempt, alreadyFinalized: true };

  const test = await Test.findById(attempt.testId).lean();

  const questions = await loadQuestions(attempt.questionOrder);
  const result = scoreAttempt({
    questions,
    responses: attempt.responses,
    negativeMarks: test?.negativeMarks ?? 0,
    passMarks: test?.passMarks ?? null
  });

  const band = attempt.result?.band ?? null;
  const payload = { ...result, band };

  const updated = await Attempt.findOneAndUpdate(
    { _id: attempt._id, status: ATTEMPT_STATUS.IN_PROGRESS },
    {
      $set: {
        status: ATTEMPT_STATUS.SUBMITTED,
        submittedAt: new Date(),
        autoSubmitted: Boolean(auto),
        autoSubmitReason: auto ? reason : null,
        result: payload
      }
    },
    { new: true }
  );

  if (!updated) {
    // Another process finalized first - return the stored doc (idempotent).
    const current = await Attempt.findById(attempt._id).lean();
    if (current?.status === ATTEMPT_STATUS.SUBMITTED) return { attempt: current, alreadyFinalized: true };
    throw ApiError.internal('Could not finalize attempt');
  }

  await updateStreak(attempt.userId);

  if (emit && test) {
    try {
      const { emitLeaderboardUpdate } = await import('../sockets/index.js');
      emitLeaderboardUpdate(test._id);
    } catch (err) {
      log.warn('Leaderboard emit failed:', err.message);
    }
  }

  // Fire-and-forget: sending must never block or fail the submit response, and
  // sendResultEmail guards double sends with its own result.emailSentAt claim.
  if (emailEnabled() && test) {
    sendResultEmail({ attemptId: attempt._id, userId: attempt.userId, test, result: payload });
  }

  return { attempt: updated, alreadyFinalized: false };
}

export async function updateStreak(userId, now = new Date()) {
  const user = await User.findById(userId).select('streak').lean();
  if (!user) return null;

  const today = dayKey(now);
  const last = user.streak?.lastActiveDate ?? null;
  if (last === today) return user.streak;

  const yesterday = dayKey(new Date(now.getTime() - 24 * 60 * 60 * 1000));
  const count = last === yesterday ? (user.streak?.count ?? 0) + 1 : 1;

  await User.updateOne({ _id: userId }, { $set: { 'streak.count': count, 'streak.lastActiveDate': today } });
  return { count, lastActiveDate: today };
}

export async function submitAttempt({ attemptId, user, now = new Date() }) {
  const attempt = await getOwnedAttempt({ attemptId, user });
  if (attempt.status === ATTEMPT_STATUS.SUBMITTED) {
    return { attempt, alreadyFinalized: true, autoSubmitted: attempt.autoSubmitted };
  }
  const expired = now > graceDeadline(attempt.deadlineAt);
  const { attempt: finalized } = await finalizeAttempt({ attemptId: attempt._id, auto: expired });
  return { attempt: finalized, alreadyFinalized: false, autoSubmitted: expired };
}

export default {
  startAttempt,
  saveAnswer,
  finalizeAttempt,
  submitAttempt,
  logProctorEvent,
  updateStreak,
  getOwnedAttempt,
  serializeAttempt,
  isPastDeadline
};
