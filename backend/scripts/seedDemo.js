import { pathToFileURL } from 'url';
import { connectDb, disconnectDb } from '../src/config/db.js';
import { env } from '../src/config/env.js';
import { Attempt } from '../src/models/Attempt.js';
import { Bookmark } from '../src/models/Bookmark.js';
import { Question } from '../src/models/Question.js';
import { Test } from '../src/models/Test.js';
import { User } from '../src/models/User.js';
import {
  finalizeAttempt,
  logProctorEvent,
  saveAnswer,
  startAttempt,
  submitAttempt,
  updateStreak
} from '../src/services/attemptService.js';
import { generateTest } from '../src/services/testService.js';
import { ATTEMPT_STATUS, PROCTOR_EVENTS, TEST_STATUS } from '../src/utils/constants.js';
import { dayKey, round2 } from '../src/utils/id.js';
import { createLogger } from '../src/utils/logger.js';

const log = createLogger('seed:demo');

export const DEMO_EMAIL_DOMAIN = 'learnprep.demo';
export const DEMO_PASSWORD = process.env.DEMO_PASSWORD || 'Demo@12345';

const DEMO_TESTS_COUNT = 3;
const DAY_MS = 24 * 60 * 60 * 1000;
const FIXED_SEED = 20241010;

/**
 * Tiny deterministic PRNG (mulberry32) so every run of the seed produces the
 * same student answers. No external dependency, fixed seed on purpose.
 */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomInt(rng, min, max) {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function wrongIndex(rng, question) {
  const wrong = question.options.map((_, i) => i).filter((i) => i !== question.correctIndex);
  return wrong[Math.floor(rng() * wrong.length)];
}

/** 10:00 on "now minus n days" - used for the backdated submittedAt. */
function daysAgo(n, base = new Date()) {
  const anchor = new Date(base.getFullYear(), base.getMonth(), base.getDate(), 10, 0, 0, 0);
  return new Date(anchor.getTime() - n * DAY_MS);
}

const TIME_RANGES = { easy: [6, 18], medium: [10, 26], hard: [16, 36] };

function answerTime(rng, difficulty, fast = false) {
  const [lo, hi] = TIME_RANGES[difficulty] ?? TIME_RANGES.medium;
  const span = fast ? 0.4 : 1;
  return Math.round(randomInt(rng, lo, hi) * span * 10) / 10;
}

function mostFrequentTopic(questions) {
  const counts = new Map();
  for (const q of questions) counts.set(q.topic, (counts.get(q.topic) ?? 0) + 1);
  let best = null;
  let bestCount = 0;
  for (const [topic, n] of counts) {
    if (n > bestCount) {
      best = topic;
      bestCount = n;
    }
  }
  return best;
}

const acc = (easy, medium, hard) => ({ easy, medium, hard });

/**
 * Ten students. Values are accuracies (0-1) per difficulty; `attempts` lists
 * the submitted attempts (test index 0-2, backdated age in days). The order of
 * entries matters - Vikram's test-2 answers are generated first and Pooja ties
 * them so the leaderboard shows an exact score tie with different durations.
 */
const STUDENTS = [
  {
    username: 'aarav.sharma',
    name: 'Aarav Sharma',
    rollno: 'TYCS001',
    grade: 'TYCS Sem V',
    acc: acc(0.96, 0.93, 0.89),
    skip: 0.03,
    attempts: [0, 1, 2, 3, 4, 5, 6].map((day) => ({ test: day % DEMO_TESTS_COUNT, at: day })),
    perfectOn: 0
  },
  {
    username: 'riya.patil',
    name: 'Riya Patil',
    rollno: 'TYCS002',
    grade: 'TYCS Sem V',
    skip: 0.06,
    attempts: [
      { test: 0, at: 12, acc: acc(0.7, 0.55, 0.42) },
      { test: 1, at: 6, acc: acc(0.78, 0.66, 0.55) },
      { test: 2, at: 1, acc: acc(0.88, 0.8, 0.7) }
    ],
    bookmarks: 3
  },
  {
    username: 'karan.mehta',
    name: 'Karan Mehta',
    rollno: 'TYCS003',
    grade: 'TYCS Sem V',
    skip: 0.12,
    attempts: [
      { test: 0, at: 10, acc: acc(0.68, 0.52, 0.38) },
      { test: 0, at: 3, acc: acc(0.68, 0.52, 0.38) }
    ],
    bookmarks: 2
  },
  {
    username: 'sneha.iyer',
    name: 'Sneha Iyer',
    rollno: 'TYCS004',
    grade: 'TYCS Sem V',
    skip: 0.05,
    attempts: [
      { test: 0, at: 12, acc: acc(0.9, 0.72, 0.6) },
      { test: 1, at: 6, acc: acc(0.72, 0.58, 0.42) },
      { test: 2, at: 1, acc: acc(0.55, 0.4, 0.28) }
    ]
  },
  {
    username: 'rohan.desai',
    name: 'Rohan Desai',
    rollno: 'TYCS005',
    grade: 'TYCS Sem V',
    skip: 0.05,
    attempts: [
      { test: 0, at: 9, acc: acc(0.45, 0.3, 0.2), weak: true },
      { test: 1, at: 5, skipAll: true },
      { test: 2, at: 2, acc: acc(0.45, 0.3, 0.2), weak: true }
    ],
    bookmarks: 2
  },
  {
    username: 'ayesha.khan',
    name: 'Ayesha Khan',
    rollno: 'SYCS001',
    grade: 'SYCS Sem III',
    skip: 0.55,
    attempts: [
      { test: 1, at: 8, acc: acc(0.97, 0.94, 0.9) },
      { test: 2, at: 3, acc: acc(0.97, 0.94, 0.9), skip: 0.5 }
    ]
  },
  {
    username: 'vikram.nair',
    name: 'Vikram Nair',
    rollno: 'SYCS002',
    grade: 'SYCS Sem III',
    skip: 0.08,
    attempts: [
      { test: 0, at: 8, acc: acc(0.72, 0.58, 0.44), switches: 5 },
      { test: 1, at: 5, acc: acc(0.72, 0.58, 0.44), switches: 3 },
      { test: 2, at: 2, acc: acc(0.6, 0.46, 0.34), auto: true, tie: 'generate' }
    ]
  },
  {
    username: 'pooja.joshi',
    name: 'Pooja Joshi',
    rollno: 'SYCS003',
    grade: 'SYCS Sem III',
    skip: 0.08,
    attempts: [{ test: 2, at: 2, tie: 'use', fast: true }],
    inProgressTest: 0
  },
  {
    username: 'arjun.reddy',
    name: 'Arjun Reddy',
    rollno: 'SYCS004',
    grade: 'SYCS Sem III',
    attempts: []
  },
  {
    username: 'neha.gupta',
    name: 'Neha Gupta',
    rollno: 'SYCS005',
    grade: 'SYCS Sem III',
    skip: 0.15,
    attempts: [
      { test: 1, at: 20, acc: acc(0.62, 0.48, 0.34) },
      { test: 2, at: 14, acc: acc(0.58, 0.44, 0.3) }
    ],
    deactivate: true
  }
];

async function ensureDemoTests(now) {
  const existing = await Test.find({ title: { $regex: /^\[Demo\] / }, status: TEST_STATUS.ACTIVE }).lean();
  if (existing.length >= DEMO_TESTS_COUNT) return existing.slice(0, DEMO_TESTS_COUNT);

  const [subjects, totalBank] = await Promise.all([
    Question.aggregate([
      { $match: { isDeleted: false } },
      { $group: { _id: '$subject', count: { $sum: 1 } } },
      { $match: { count: { $gte: 6 } } },
      { $sort: { count: -1, _id: 1 } }
    ]),
    Question.countDocuments({ isDeleted: false })
  ]);

  if (totalBank < 24 || subjects.length < DEMO_TESTS_COUNT) {
    throw new Error(
      `Question bank is too small for the demo plan (need ~30 live questions across at least ` +
        `${DEMO_TESTS_COUNT} subjects with 6+ each; found ${totalBank} questions / ${subjects.length} such ` +
        `subjects). Add more questions to the bank first, then re-run seed:demo.`
    );
  }

  const created = [];
  for (let i = 0; i < DEMO_TESTS_COUNT - existing.length; i += 1) {
    const subject = subjects[i]._id;
    const count = subjects[i].count;
    const test = await generateTest({
      title: `[Demo] ${subject} Mock Test`,
      subject,
      description: 'Demo test created by npm run seed:demo',
      count: Math.min(10, count),
      durationMinutes: 25,
      negativeMarks: 0,
      passMarks: null,
      shuffle: true,
      isAdaptive: false,
      maxTabSwitches: 0,
      maxAttempts: 0,
      status: TEST_STATUS.ACTIVE,
      activeFrom: new Date(now.getTime() - DAY_MS),
      activeUntil: new Date(now.getTime() + 60 * DAY_MS)
    });
    created.push(test);
  }

  return [...created, ...existing].slice(0, DEMO_TESTS_COUNT);
}

async function upsertStudent(info) {
  const username = info.username.toLowerCase();
  const email = `${username}@${DEMO_EMAIL_DOMAIN}`;
  const existing = await User.findOne({ username }).select('email').lean();

  if (existing) {
    const owned = (existing.email || '').toLowerCase().endsWith(`@${DEMO_EMAIL_DOMAIN}`);
    if (!owned) {
      log.warn(`username ${username} already exists as a real account - not touching it`);
      return null;
    }
    await User.updateOne(
      { _id: existing._id },
      { $set: { name: info.name, rollno: info.rollno, grade: info.grade, isActive: info.deactivate ? false : true } }
    );
    return User.findById(existing._id);
  }

  const user = new User({
    name: info.name,
    username,
    email,
    rollno: info.rollno,
    role: 'student',
    grade: info.grade,
    isActive: true
  });
  await user.setPassword(DEMO_PASSWORD);
  await user.save();
  return user;
}

async function createAttempt({ user, test, spec, rng, tieBank, now }) {
  const baseNow = new Date(now.getTime());
  const { attempt } = await startAttempt({ user, testId: test._id, now: baseNow });

  const qids = attempt.questionOrder.map((q) => String(q._id ?? q));
  const questions = await Question.find({ _id: { $in: qids } }).lean();
  const byId = new Map(questions.map((q) => [String(q._id), q]));

  const preset = spec.tie === 'use' ? tieBank.get(String(test._id)) : null;
  const weakTopic = spec.weak ? mostFrequentTopic(questions) : null;
  const answerMap = new Map();
  let totalTimeSec = 30;
  let cursor = baseNow.getTime();

  for (let i = 0; i < qids.length; i += 1) {
    const q = byId.get(qids[i]);
    let selected = null;

    if (spec.skipAll) {
      selected = null;
    } else if (preset && preset.has(String(q._id))) {
      selected = preset.get(String(q._id));
    } else if (spec.perfect || (spec.perfectOn !== undefined && spec.at === spec.perfectOn)) {
      selected = q.correctIndex;
    } else {
      const isWeak = weakTopic && q.topic === weakTopic;
      const correctProb = isWeak ? 0.04 : (spec.acc?.[q.difficulty] ?? 0.5);
      const skipProb = spec.skip ?? 0.05;
      if (rng() < skipProb) selected = null;
      else if (rng() < correctProb) selected = q.correctIndex;
      else selected = wrongIndex(rng, q);
    }

    const t = selected === null ? randomInt(rng, 2, 5) : answerTime(rng, q.difficulty, spec.fast);
    answerMap.set(String(q._id), selected);
    totalTimeSec += t;
    cursor += t * 1000;
    await saveAnswer({
      attemptId: attempt._id,
      user,
      questionId: q._id,
      selectedIndex: selected,
      timeSpentSec: t,
      now: new Date(cursor)
    });
  }

  if (spec.switches && spec.switches > 0) {
    for (let k = 0; k < spec.switches; k += 1) {
      cursor += 1500;
      await logProctorEvent({ attemptId: attempt._id, user, type: PROCTOR_EVENTS.TAB_SWITCH, now: new Date(cursor) });
    }
  }

  if (spec.auto) {
    const expired = new Date(baseNow.getTime() + (test.durationMinutes + 20) * 60 * 1000);
    await submitAttempt({ attemptId: attempt._id, user, now: expired });
  } else {
    await finalizeAttempt({ attemptId: attempt._id, emit: false });
  }

  if (spec.tie === 'generate') tieBank.set(String(test._id), answerMap);

  const final = await Attempt.findById(attempt._id).lean();
  const submittedAt = daysAgo(spec.at, now);
  const totalMs = totalTimeSec * 1000;
  const startedAt = new Date(submittedAt.getTime() - totalMs);
  const deadlineAt = new Date(startedAt.getTime() + test.durationMinutes * 60 * 1000);
  const finalSubmittedAt = spec.auto ? new Date(deadlineAt.getTime() + 90 * 1000) : submittedAt;

  const responses = (final.responses ?? []).map((r, i) => ({
    ...r,
    savedAt: new Date(startedAt.getTime() + (i + 1) * Math.floor(totalMs / ((final.responses?.length ?? 1) + 1)))
  }));
  const events = (final.events ?? []).map((e, i) => ({
    ...e,
    at: new Date(startedAt.getTime() + (i + 1) * 1500)
  }));

  await Attempt.updateOne(
    { _id: final._id },
    { $set: { startedAt, deadlineAt, submittedAt: finalSubmittedAt, responses, events } }
  );

  return { attempt: final, questions };
}

async function createInProgressAttempt({ user, test, rng, now }) {
  const baseNow = new Date(now.getTime());
  const { attempt } = await startAttempt({ user, testId: test._id, now: baseNow });

  const qids = attempt.questionOrder.map((q) => String(q._id ?? q));
  const questions = await Question.find({ _id: { $in: qids } }).lean();
  const byId = new Map(questions.map((q) => [String(q._id), q]));
  const wanted = Math.max(1, Math.round(qids.length * 0.45));
  let cursor = baseNow.getTime();

  for (let i = 0; i < wanted; i += 1) {
    const q = byId.get(qids[i]);
    const selected = rng() < 0.85 ? q.correctIndex : wrongIndex(rng, q);
    const t = answerTime(rng, q.difficulty);
    cursor += t * 1000;
    await saveAnswer({ attemptId: attempt._id, user, questionId: q._id, selectedIndex: selected, timeSpentSec: t, now: new Date(cursor) });
  }

  return attempt;
}

function printSummary(summary) {
  const header = ['name', 'username', 'rollno', 'class', 'attempts', 'avg%'];
  const widths = [16, 16, 10, 12, 8, 6];
  const cells = (row) => row.map((c, i) => String(c).padEnd(widths[i])).join('  ');
  log.info(cells(header));
  for (const r of summary.rows) {
    log.info(cells([r.name, r.username, r.rollno, r.grade, r.attempts, r.avg ?? '-']));
  }
  log.info(
    `demo students created: ${summary.studentsCreated} (skipped: ${summary.studentsSkipped}, failed: ${summary.failedStudents.length})`
  );
  log.info(`attempts created: ${summary.attemptsCreated} (skipped: ${summary.attemptsSkipped})`);
  log.info(`bookmarks created: ${summary.bookmarksCreated}`);
  log.info(`demo password: ${DEMO_PASSWORD}`);
  if (summary.failedStudents.length) log.warn(`students that failed: ${summary.failedStudents.join(', ')}`);
}

/** Seeds the demo data. Idempotent: safe to run repeatedly. */
export async function seedDemo({ now = new Date() } = {}) {
  if (env.IS_PROD) throw new Error('seed:demo refuses to run in production (NODE_ENV=production)');

  const rng = mulberry32(FIXED_SEED);
  const tests = await ensureDemoTests(now);
  log.info(`using ${tests.length} tests: ${tests.map((t) => t.title).join(', ')}`);

  const summary = {
    studentsCreated: 0,
    studentsSkipped: 0,
    attemptsCreated: 0,
    attemptsSkipped: 0,
    bookmarksCreated: 0,
    failedStudents: [],
    rows: []
  };
  const tieBank = new Map();

  for (const info of STUDENTS) {
    try {
      const user = await upsertStudent(info);
      if (!user) {
        summary.studentsSkipped += 1;
        continue;
      }
      summary.studentsCreated += 1;

      const plan = info.attempts ?? [];
      const desired = new Map();
      for (const spec of plan) {
        const key = String(tests[spec.test]._id);
        desired.set(key, (desired.get(key) ?? 0) + 1);
      }
      const current = new Map();
      const mine = await Attempt.find({
        userId: user._id,
        status: ATTEMPT_STATUS.SUBMITTED,
        testId: { $in: tests.map((t) => t._id) }
      })
        .select('testId')
        .lean();
      for (const a of mine) current.set(String(a.testId), (current.get(String(a.testId)) ?? 0) + 1);

      const usedQuestionIds = new Set();
      for (const spec of plan) {
        const key = String(tests[spec.test]._id);
        if ((current.get(key) ?? 0) >= desired.get(key)) {
          summary.attemptsSkipped += 1;
          continue;
        }
        const fullSpec = { acc: info.acc, skip: info.skip, perfectOn: info.perfectOn, ...spec };
        const { questions } = await createAttempt({ user, test: tests[spec.test], spec: fullSpec, rng, tieBank, now });
        summary.attemptsCreated += 1;
        for (const q of questions) usedQuestionIds.add(String(q._id));
        current.set(key, (current.get(key) ?? 0) + 1);
      }

      if (info.inProgressTest !== undefined) {
        const existing = await Attempt.findOne({
          userId: user._id,
          testId: tests[info.inProgressTest]._id,
          status: ATTEMPT_STATUS.IN_PROGRESS
        }).lean();
        if (!existing) await createInProgressAttempt({ user, test: tests[info.inProgressTest], rng, now });
      }

      if (info.deactivate) {
        await User.updateOne({ _id: user._id }, { $set: { isActive: false } });
      }

      if (info.bookmarks) {
        const pool = [...usedQuestionIds];
        const picked = new Set();
        while (picked.size < info.bookmarks && picked.size < pool.length) {
          picked.add(pool[Math.floor(rng() * pool.length)]);
        }
        for (const qid of picked) {
          const dup = await Bookmark.findOne({ userId: user._id, questionId: qid }).lean();
          if (dup) continue;
          await Bookmark.create({ userId: user._id, questionId: qid, note: 'Saved for revision' });
          summary.bookmarksCreated += 1;
        }
      }

      const submitted = await Attempt.countDocuments({ userId: user._id, status: ATTEMPT_STATUS.SUBMITTED });
      const agg = await Attempt.aggregate([
        { $match: { userId: user._id, status: ATTEMPT_STATUS.SUBMITTED } },
        { $group: { _id: null, avg: { $avg: '$result.percentage' } } }
      ]);
      summary.rows.push({
        name: info.name,
        username: info.username,
        rollno: info.rollno,
        grade: info.grade,
        attempts: submitted,
        avg: agg.length ? round2(agg[0].avg) : null
      });
    } catch (err) {
      summary.failedStudents.push(info.username);
      log.error(`student ${info.username} failed:`, err.message);
    }
  }

  // Aarav's 7 attempts land on 7 consecutive days, so build the streak with the
  // real updateStreak service (one call per day) instead of writing it by hand.
  const aarav = await User.findOne({ username: 'aarav.sharma' }).lean();
  if (aarav) {
    const start = daysAgo(6, now);
    for (let i = 6; i >= 0; i -= 1) {
      await updateStreak(aarav._id, new Date(start.getTime() + (6 - i) * DAY_MS));
    }
    const final = await User.findById(aarav._id).lean();
    log.info(`aarav.sharma streak: count=${final.streak?.count ?? 0} last=${final.streak?.lastActiveDate ?? dayKey(now)}`);
  }

  printSummary(summary);
  return summary;
}

/** Removes demo students and their attempts/bookmarks and the [Demo] tests. */
export async function resetDemo() {
  const demoUsers = await User.find({ email: { $regex: new RegExp(`@${DEMO_EMAIL_DOMAIN}$`, 'i') } })
    .select('_id')
    .lean();
  const demoTests = await Test.find({ title: { $regex: /^\[Demo\] / } })
    .select('_id')
    .lean();
  const userIds = demoUsers.map((u) => u._id);
  const testIds = demoTests.map((t) => t._id);

  const attempts =
    userIds.length || testIds.length
      ? await Attempt.deleteMany({ $or: [{ userId: { $in: userIds } }, { testId: { $in: testIds } }] })
      : { deletedCount: 0 };
  const bookmarks = userIds.length ? await Bookmark.deleteMany({ userId: { $in: userIds } }) : { deletedCount: 0 };
  const users = userIds.length ? await User.deleteMany({ _id: { $in: userIds } }) : { deletedCount: 0 };
  const tests = testIds.length ? await Test.deleteMany({ _id: { $in: testIds } }) : { deletedCount: 0 };

  const result = {
    students: users.deletedCount ?? 0,
    attempts: attempts.deletedCount ?? 0,
    bookmarks: bookmarks.deletedCount ?? 0,
    tests: tests.deletedCount ?? 0
  };
  log.info(`reset complete: students=${result.students} attempts=${result.attempts} bookmarks=${result.bookmarks} tests=${result.tests}`);
  return result;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  connectDb()
    .then(async () => {
      if (process.argv.includes('--reset')) await resetDemo();
      else await seedDemo();
      await disconnectDb();
      process.exit(0);
    })
    .catch(async (err) => {
      log.error('seed:demo failed:', err.message);
      await disconnectDb().catch(() => {});
      process.exit(1);
    });
}

export default seedDemo;