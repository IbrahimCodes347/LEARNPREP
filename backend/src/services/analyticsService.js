import mongoose from 'mongoose';
import { Attempt } from '../models/Attempt.js';
import { User } from '../models/User.js';
import {
  ATTEMPT_STATUS,
  PASS_PERCENTAGE,
  RECOMMENDATION_LEVELS,
  ROLES,
  UNASSIGNED_GRADE,
  gradeNormalizeExpr,
  gradeReportableExpr,
  normalizeGrade,
  recommendationLevel,
  recommendationMessage
} from '../utils/constants.js';
import { round2, toObjectId } from '../utils/id.js';

export async function classStats({ grade } = {}) {
  const rows = await Attempt.aggregate([
    ...gradeParse({ grade }),
    {
      $group: {
        _id: '$gradeNormalized',
        students: { $addToSet: '$userId' },
        attempts: { $sum: 1 },
        avgPercentage: { $avg: '$result.percentage' },
        bestPercentage: { $max: '$result.percentage' },
        passed: { $sum: { $cond: [{ $eq: ['$result.passed', true] }, 1, 0] } },
        total: { $sum: 1 }
      }
    },
    {
      $project: {
        _id: 0,
        grade: '$_id',
        students: { $size: '$students' },
        attempts: 1,
        avgPercentage: { $round: ['$avgPercentage', 2] },
        bestPercentage: { $round: ['$bestPercentage', 2] },
        passRate: {
          $round: [
            {
              $cond: [{ $eq: ['$total', 0] }, 0, { $multiply: [{ $divide: ['$passed', '$total'] }, 100] }]
            },
            2
          ]
        }
      }
    },
    { $sort: { grade: 1 } }
  ]);

  const toppers = await toppersPerClass({ grade });

  return { classes: rows, toppers };
}

/**
 * Shared start of every grade pipeline: only students form grade groups and
 * every stored grade is normalised to its canonical spelling (see
 * constants.gradeNormalizeExpr) so "TYCS SEM V" and "tycs" merge with
 * "TYCS Sem V" and blanks become the UNASSIGNED_GRADE bucket. The optional
 * `grade` filter matches the normalised value, exactly like the dropdowns.
 */
function gradeParse({ testId, grade } = {}) {
  const testOid = toObjectId(testId, 'test id');
  const baseMatch = {
    status: ATTEMPT_STATUS.SUBMITTED,
    ...(testOid ? { testId: testOid } : {})
  };

  return [
    { $match: baseMatch },
    { $lookup: { from: 'users', localField: 'userId', foreignField: '_id', as: 'user' } },
    { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
    // Faculty/admin accounts must never appear in a student report, and legacy
    // grades that are not a canonical option (see constants.gradeReportableExpr)
    // must never form a bucket. Both live in this shared pipeline start.
    { $match: { 'user.role': ROLES.STUDENT, $expr: gradeReportableExpr('$user.grade') } },
    { $addFields: { gradeNormalized: gradeNormalizeExpr('$user.grade') } },
    ...(grade ? [{ $match: { gradeNormalized: normalizeGrade(grade) ?? UNASSIGNED_GRADE } }] : [])
  ];
}

/**
 * Pass rule shared by the report rows, the summary cards and every chart: a
 * student passes when the AVERAGE of their submitted result percentages is
 * >= PASS_PERCENTAGE (exact hit passes, 19.99 fails). The class filter applies
 * to everything; search and status only narrow the table rows, so the cards and
 * charts always describe the selected class.
 */
export async function studentReport({
  grade,
  testId,
  search,
  status,
  sortBy,
  sortDir,
  page = 1,
  limit = 20
} = {}) {
  // One document per student in the class, carrying the numbers the cards,
  // charts, table and recommendation all need. Sorted by submittedAt first so
  // $last means "most recent" for lastPercentage / lastAttemptAt and $push
  // keeps the percentages chronological.
  const aggregateRows = await Attempt.aggregate([
    ...gradeParse({ grade, testId }),
    { $sort: { submittedAt: 1 } },
    {
      $group: {
        _id: '$userId',
        grade: { $first: '$gradeNormalized' },
        name: { $first: '$user.name' },
        username: { $first: '$user.username' },
        rollno: { $first: '$user.rollno' },
        attemptsCount: { $sum: 1 },
        avgPercentage: { $avg: '$result.percentage' },
        bestPercentage: { $max: '$result.percentage' },
        lastPercentage: { $last: '$result.percentage' },
        lastAttemptAt: { $last: '$submittedAt' },
        percentages: { $push: '$result.percentage' },
        weakTopicLists: { $push: '$result.weakTopics' }
      }
    }
  ]);

  const students = aggregateRows.map(enrichStudent);
  const summary = summarize(students);
  const charts = buildCharts(students, { grade });
  const classes = await classList();

  const filtered = students.filter((s) => {
    if (search) {
      const rx = String(search).trim().toLowerCase();
      const hayStack = [s.name, s.username, s.rollno].filter((v) => v != null).join(' ').toLowerCase();
      if (!hayStack.includes(rx)) return false;
    }
    if (status && s.status !== status) return false;
    return true;
  });

  const sorted = sortStudents(filtered, sortBy, sortDir);
  const total = sorted.length;

  return {
    students: sorted.slice((page - 1) * limit, page * limit),
    total,
    page,
    limit,
    summary,
    charts,
    classes,
    passPercentage: PASS_PERCENTAGE
  };
}

/** Per-student attempt history for the expandable row, oldest first. */
export async function studentHistory({ userId }) {
  const oid = toObjectId(userId, 'student id');
  const student = await User.findOne({ _id: oid, role: ROLES.STUDENT })
    .select('name username rollno grade')
    .lean();
  if (!student) return null;

  const attempts = await Attempt.find({ userId: oid, status: ATTEMPT_STATUS.SUBMITTED })
    .sort({ submittedAt: 1 })
    .populate('testId', 'title subject')
    .lean();

  return {
    student: {
      id: String(student._id),
      name: student.name,
      username: student.username,
      rollno: student.rollno,
      grade: normalizeGrade(student.grade) ?? UNASSIGNED_GRADE
    },
    history: attempts.map((a, i) => ({
      attempt: i + 1,
      testId: a.testId ? String(a.testId._id) : null,
      testTitle: a.testId?.title ?? 'Deleted test',
      subject: a.testId?.subject ?? null,
      percentage: a.result?.percentage ?? 0,
      submittedAt: a.submittedAt
    }))
  };
}

/** All class values across the student base, normalised, for the filter dropdown. */
async function classList() {
  const rows = await User.aggregate([
    { $match: { role: ROLES.STUDENT, $expr: gradeReportableExpr('$grade') } },
    { $addFields: { gradeNormalized: gradeNormalizeExpr('$grade') } },
    { $group: { _id: '$gradeNormalized', students: { $sum: 1 } } },
    { $sort: { _id: 1 } },
    { $project: { _id: 0, grade: '$_id', students: 1 } }
  ]);
  return rows.map((r) => ({ grade: r.grade, students: r.students }));
}

/** Turn one aggregated row into a report student with status, trend, weak topics and recommendation. */
function enrichStudent(row) {
  const percentages = (row.percentages ?? []).map((p) => round2(p));
  const weakTopics = weakTopicsOf(row.weakTopicLists ?? []);
  const avgPercentage = round2(row.avgPercentage ?? 0);
  const bestPercentage = round2(row.bestPercentage ?? 0);
  const lastPercentage =
    row.lastPercentage === null || row.lastPercentage === undefined ? null : round2(row.lastPercentage);
  const level = recommendationLevel({ avgPercentage, attemptsCount: row.attemptsCount, percentages });

  return {
    userId: String(row._id),
    name: row.name ?? null,
    username: row.username ?? null,
    rollno: row.rollno ?? null,
    grade: row.grade ?? UNASSIGNED_GRADE,
    attemptsCount: row.attemptsCount,
    avgPercentage,
    bestPercentage,
    lastPercentage,
    lastAttemptAt: row.lastAttemptAt ?? null,
    status: avgPercentage >= PASS_PERCENTAGE ? 'passed' : 'failed',
    trend: trendOf(percentages),
    weakTopics,
    recommendation: {
      level,
      message: recommendationMessage(level, { avgPercentage, percentages, weakTopics })
    }
  };
}

/** Top two weak topics by how often they appear across the student's attempts. */
function weakTopicsOf(lists) {
  const counts = new Map();
  for (const list of lists) {
    for (const topic of list ?? []) {
      if (!topic) continue;
      counts.set(topic, (counts.get(topic) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 2)
    .map(([topic]) => topic);
}

/** up / down / flat from the last two results; null until there are two. */
function trendOf(percentages) {
  if (percentages.length < 2) return null;
  const last = percentages[percentages.length - 1];
  const prev = percentages[percentages.length - 2];
  if (last > prev) return 'up';
  if (last < prev) return 'down';
  return 'flat';
}

/** Summary cards: student-mean average, pass rate and at-risk count for the class. */
function summarize(students) {
  const studentsCount = students.length;
  const attemptsCount = students.reduce((n, s) => n + s.attemptsCount, 0);
  const avgPercentage = studentsCount
    ? round2(students.reduce((n, s) => n + s.avgPercentage, 0) / studentsCount)
    : 0;
  const passedCount = students.filter((s) => s.status === 'passed').length;
  return {
    studentsCount,
    attemptsCount,
    avgPercentage,
    passedCount,
    failedCount: studentsCount - passedCount,
    passRate: studentsCount ? round2((passedCount / studentsCount) * 100) : 0,
    atRiskCount: students.filter((s) => s.recommendation.level === RECOMMENDATION_LEVELS.ATTENTION).length
  };
}

/** Charts anchored to the same class data: pass/fail, score buckets, avg per class. */
function buildCharts(students, { grade }) {
  const passed = students.filter((s) => s.status === 'passed').length;
  const distribution = ['0-20', '20-40', '40-60', '60-80', '80-100'].map((range) => ({ range, students: 0 }));
  for (const s of students) {
    distribution[Math.min(4, Math.floor(s.avgPercentage / 20))].students += 1;
  }

  const avgPerClass = grade
    ? []
    : Object.values(
        students.reduce((acc, s) => {
          const key = s.grade || UNASSIGNED_GRADE;
          acc[key] ??= { grade: key, students: 0, sum: 0 };
          acc[key].students += 1;
          acc[key].sum += s.avgPercentage;
          return acc;
        }, {})
      )
        .map((g) => ({ grade: g.grade, avgPercentage: round2(g.sum / g.students) }))
        .sort((a, b) => a.grade.localeCompare(b.grade));

  return {
    passFail: { passed, failed: students.length - passed },
    scoreDistribution: distribution,
    avgPerClass
  };
}

const SORTABLE_KEYS = [
  'name',
  'username',
  'rollno',
  'avgPercentage',
  'bestPercentage',
  'lastPercentage',
  'attemptsCount',
  'lastAttemptAt',
  'status'
];

function sortStudents(list, sortBy, sortDir) {
  const key = SORTABLE_KEYS.includes(sortBy) ? sortBy : 'avgPercentage';
  const dir = sortDir === 'asc' ? 1 : -1; // API default is avgPercentage desc
  return [...list].sort((a, b) => {
    const av = a[key];
    const bv = b[key];
    if (av === null || av === undefined) return 1;
    if (bv === null || bv === undefined) return -1;
    const cmp = typeof av === 'string' ? av.localeCompare(bv) : av - bv;
    return cmp * dir || String(a.name ?? '').localeCompare(String(b.name ?? ''));
  });
}

/**
 * One performance per student per grade (best attempt), the top 3 by score.
 * Grade matching is normalised the same way as the report so "TYCS SEM V"
 * and "tycs" land in the same bucket as "TYCS Sem V".
 */
async function toppersPerClass({ grade }) {
  const rows = await Attempt.aggregate([
    { $match: { status: ATTEMPT_STATUS.SUBMITTED } },
    { $sort: { 'result.percentage': -1, submittedAt: 1 } },
    { $group: { _id: '$userId', best: { $first: '$root' } } },
    { $sort: { 'best.result.percentage': -1 } },
    { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
    { $unwind: '$user' },
    { $match: { 'user.role': ROLES.STUDENT, $expr: gradeReportableExpr('$user.grade') } },
    { $addFields: { gradeNormalized: gradeNormalizeExpr('$user.grade') } },
    ...(grade ? [{ $match: { gradeNormalized: normalizeGrade(grade) } }] : []),
    {
      $group: {
        _id: '$gradeNormalized',
        students: {
          $push: {
            userId: { $toString: '$_id' },
            name: '$user.name',
            percentage: '$best.result.percentage'
          }
        }
      }
    },
    { $unwind: '$students' },
    { $group: { _id: '$_id', toppers: { $push: '$students' } } },
    { $project: { _id: 0, grade: '$_id', toppers: { $slice: ['$toppers', 3] } } },
    { $sort: { grade: 1 } }
  ]);
  return rows;
}

/**
 * One per-(attempt x question) row: the attempt it came from, the question
 * metadata, and just that student's response. `questionAnalytics` groups these
 * rows and `questionDetailStats` filters them, so the table and the drill-down
 * can never disagree about attempted, correct, wrong or skipped. Answered means
 * `selectedIndex !== null`, the same rule `scoreService` uses.
 */
function questionRows({ testId, subject, topic, difficulty, questionId } = {}) {
  const qMatch = {};
  if (subject) qMatch['question.subject'] = subject;
  if (topic) qMatch['question.topic'] = topic;
  if (difficulty) qMatch['question.difficulty'] = difficulty;

  // `testId` arrives as a hex string from the query string; aggregate() does not
  // cast, so without this the "filter by test" table comes back empty.
  const testOid = toObjectId(testId, 'test id');
  const questionOid = questionId ? toObjectId(questionId, 'question id') : null;
  const baseMatch = {
    status: ATTEMPT_STATUS.SUBMITTED,
    ...(testOid ? { testId: testOid } : {}),
    ...(questionOid ? { questionOrder: questionOid } : {})
  };

  return [
    { $match: baseMatch },
    { $unwind: '$questionOrder' },
    // Narrow to one question AFTER the unwind: matching the array field above
    // only filters documents, so the full array would still expand into rows.
    ...(questionOid ? [{ $match: { questionOrder: questionOid } }] : []),
    { $lookup: { from: 'questions', localField: 'questionOrder', foreignField: '_id', as: 'question' } },
    { $unwind: '$question' },
    { $match: qMatch },
    {
      $addFields: {
        response: {
          $first: {
            $filter: {
              input: '$responses',
              as: 'r',
              cond: { $eq: ['$$r.questionId', '$questionOrder'] }
            }
          }
        }
      }
    },
    { $addFields: { answer: { $ifNull: ['$response.selectedIndex', null] } } }
  ];
}

/**
 * Per-question stats computed from live attempts (no denormalised counters).
 * Returns { items, total } so the table can paginate.
 */
export async function questionAnalytics({ testId, subject, topic, difficulty, page = 1, limit = 20 }) {
  const rows = questionRows({ testId, subject, topic, difficulty });

  const statsPipeline = [
    ...rows,
    {
      $group: {
        _id: '$questionOrder',
        subject: { $first: '$question.subject' },
        topic: { $first: '$question.topic' },
        difficulty: { $first: '$question.difficulty' },
        questionText: { $first: '$question.questionText' },
        marks: { $first: '$question.marks' },
        correctIndex: { $first: '$question.correctIndex' },
        total: { $sum: 1 },
        attempted: { $sum: { $cond: [{ $ne: ['$answer', null] }, 1, 0] } },
        correct: {
          $sum: {
            $cond: [
              { $and: [{ $ne: ['$answer', null] }, { $eq: ['$answer', '$question.correctIndex'] }] },
              1,
              0
            ]
          }
        },
        timeSum: { $sum: { $ifNull: ['$response.timeSpentSec', 0] } }
      }
    },
    {
      $project: {
        _id: 0,
        questionId: { $toString: '$_id' },
        subject: 1,
        topic: 1,
        difficulty: 1,
        questionText: 1,
        marks: 1,
        correctIndex: 1,
        attempted: 1,
        correct: 1,
        wrong: { $subtract: ['$attempted', '$correct'] },
        skipped: { $subtract: ['$total', '$attempted'] },
        total: 1,
        avgTimeSec: {
          $round: [{ $cond: [{ $gt: ['$attempted', 0] }, { $divide: ['$timeSum', '$attempted'] }, 0] }, 1]
        }
      }
    },
    {
      $addFields: {
        accuracy: {
          $round: [
            {
              $cond: [
                { $gt: ['$attempted', 0] },
                { $multiply: [{ $divide: ['$correct', '$attempted'] }, 100] },
                0
              ]
            },
            2
          ]
        }
      }
    }
  ];

  const countPipeline = [...rows, { $group: { _id: '$questionOrder' } }, { $count: 'total' }];

  const [items, countRows] = await Promise.all([
    Attempt.aggregate([
      ...statsPipeline,
      { $sort: { total: -1, questionId: 1 } },
      { $skip: (page - 1) * limit },
      { $limit: limit }
    ]),
    Attempt.aggregate(countPipeline)
  ]);

  return { items, total: countRows[0]?.total ?? 0 };
}

/**
 * Raw per-question rows used by the drill-down drawer. Built from the same
 * `questionRows` pipeline as the table, so their counts always match.
 */
export async function questionDetailStats(questionId) {
  const rows = await Attempt.aggregate([
    ...questionRows({ questionId }),
    // Oldest first so the drawer can label a repeat sitter "Attempt 1", "Attempt 2".
    { $sort: { submittedAt: 1 } },
    { $lookup: { from: 'users', localField: 'userId', foreignField: '_id', as: 'student' } },
    { $unwind: { path: '$student', preserveNullAndEmptyArrays: true } }
  ]);
  return rows.map((a) => ({
    attemptId: String(a._id),
    userId: String(a.userId),
    testId: String(a.testId),
    submittedAt: a.submittedAt,
    autoSubmitted: a.autoSubmitted,
    selectedIndex: a.answer ?? null,
    timeSpentSec: a.response?.timeSpentSec ?? 0,
    name: a.student?.name ?? null,
    username: a.student?.username ?? null,
    rollno: a.student?.rollno ?? null
  }));
}

/**
 * The pass mark is stored as raw marks on the test; the trend works in
 * percentages, so convert it once here. null when no pass mark was ever set.
 */
function passMarkPercentage(passMarks, totalMarks) {
  if (passMarks === null || passMarks === undefined) return null;
  if (!totalMarks) return null;
  return round2((passMarks / totalMarks) * 100);
}

export async function studentProgress({ userId, limit = 20 }) {
  // `userId` arrives from req.params as a string. `find()` casts it for us but
  // `aggregate()` does NOT cast pipeline values, so without this the summary
  // and trend silently come back empty while `attempts` is populated.
  const oid =
    userId instanceof mongoose.Types.ObjectId ? userId : new mongoose.Types.ObjectId(String(userId));

  const attempts = await Attempt.find({ userId: oid, status: ATTEMPT_STATUS.SUBMITTED })
    .sort({ submittedAt: -1 })
    .limit(limit)
    .populate('testId', 'title subject durationMinutes negativeMarks passMarks')
    .lean();

  const overall = await Attempt.aggregate([
    { $match: { userId: oid, status: ATTEMPT_STATUS.SUBMITTED } },
    {
      $group: {
        _id: null,
        tests: { $sum: 1 },
        avgPercentage: { $avg: '$result.percentage' },
        bestPercentage: { $max: '$result.percentage' },
        autoSubmitted: { $sum: { $cond: ['$autoSubmitted', 1, 0] } },
        tabSwitches: { $sum: '$tabSwitchCount' }
      }
    }
  ]);

  const trend = (
    await Attempt.aggregate([
      { $match: { userId: oid, status: ATTEMPT_STATUS.SUBMITTED } },
      { $sort: { submittedAt: 1 } },
      { $lookup: { from: 'tests', localField: 'testId', foreignField: '_id', as: 'test' } },
      { $unwind: { path: '$test', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 0,
          submittedAt: 1,
          percentage: '$result.percentage',
          score: '$result.score',
          totalMarks: '$result.totalMarks',
          passMarks: '$test.passMarks'
        }
      }
    ])
  ).map((t) => ({
    submittedAt: t.submittedAt,
    percentage: t.percentage,
    score: t.score,
    passPercentage: passMarkPercentage(t.passMarks, t.totalMarks)
  }));

  // Per-topic accuracy for this student, weakest first, from the scored detail
  // each attempt already stores.
  const topicBuckets = await Attempt.aggregate([
    { $match: { userId: oid, status: ATTEMPT_STATUS.SUBMITTED } },
    { $unwind: '$result.detail' },
    { $match: { 'result.detail.topic': { $nin: ['', null] } } },
    {
      $group: {
        _id: '$result.detail.topic',
        total: { $sum: 1 },
        correct: { $sum: { $cond: ['$result.detail.isCorrect', 1, 0] } }
      }
    },
    {
      $addFields: {
        accuracy: {
          $cond: [{ $gt: ['$total', 0] }, { $multiply: [{ $divide: ['$correct', '$total'] }, 100] }, 0]
        }
      }
    },
    { $sort: { accuracy: 1, total: -1, _id: 1 } }
  ]);

  const topicAccuracy = topicBuckets.map((b) => ({
    topic: b._id,
    total: b.total,
    correct: b.correct,
    accuracy: round2(b.accuracy)
  }));

  return {
    summary: overall[0]
      ? {
          tests: overall[0].tests,
          avgPercentage: round2(overall[0].avgPercentage ?? 0),
          bestPercentage: round2(overall[0].bestPercentage ?? 0),
          autoSubmitted: overall[0].autoSubmitted,
          tabSwitches: overall[0].tabSwitches
        }
      : { tests: 0, avgPercentage: 0, bestPercentage: 0, autoSubmitted: 0, tabSwitches: 0 },
    trend,
    topicAccuracy,
    attempts: attempts.map((a) => ({
      id: String(a._id),
      testTitle: a.testId?.title ?? 'Deleted test',
      subject: a.testId?.subject ?? null,
      score: a.result?.score ?? 0,
      totalMarks: a.result?.totalMarks ?? 0,
      percentage: a.result?.percentage ?? 0,
      passed: a.result?.passed ?? null,
      submittedAt: a.submittedAt,
      autoSubmitted: a.autoSubmitted
    }))
  };
}

export async function attemptLogs({
  page = 1,
  limit = 20,
  testId,
  autoSubmitted,
  hasTabSwitches,
  status
} = {}) {
  const match = {};
  if (status) match.status = status;
  else match.status = ATTEMPT_STATUS.SUBMITTED;
  if (testId) match.testId = testId;
  if (autoSubmitted === 'true') match.autoSubmitted = true;
  if (autoSubmitted === 'false') match.autoSubmitted = false;
  if (hasTabSwitches === 'true') match.tabSwitchCount = { $gt: 0 };

  const [items, total] = await Promise.all([
    Attempt.find(match)
      .sort({ submittedAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('userId', 'name username rollno grade')
      .populate('testId', 'title subject')
      .lean(),
    Attempt.countDocuments(match)
  ]);

  return { items, total };
}

export async function dashboard({ userId, grade }) {
  // Same casting trap as studentProgress: aggregate() does not cast a string.
  const oid =
    userId instanceof mongoose.Types.ObjectId ? userId : new mongoose.Types.ObjectId(String(userId));
  const user = await User.findById(oid).select('streak name grade').lean();

  const summary = await Attempt.aggregate([
    { $match: { userId: oid, status: ATTEMPT_STATUS.SUBMITTED } },
    {
      $group: {
        _id: null,
        testsTaken: { $sum: 1 },
        avgPercentage: { $avg: '$result.percentage' },
        bestPercentage: { $max: '$result.percentage' },
        passed: { $sum: { $cond: [{ $eq: ['$result.passed', true] }, 1, 0] } },
        totalTimeSec: {
          $sum: { $max: [0, { $divide: [{ $subtract: ['$submittedAt', '$startedAt'] }, 1000] }] }
        }
      }
    }
  ]);

  const trend = await Attempt.aggregate([
    { $match: { userId: oid, status: ATTEMPT_STATUS.SUBMITTED } },
    { $sort: { submittedAt: 1 } },
    { $lookup: { from: 'tests', localField: 'testId', foreignField: '_id', as: 'test' } },
    { $unwind: '$test' },
    { $group: { _id: '$test.subject', avgPercentage: { $avg: '$result.percentage' }, tests: { $sum: 1 } } },
    { $project: { _id: 0, subject: '$_id', avgPercentage: { $round: ['$avgPercentage', 2] }, tests: 1 } }
  ]);

  const weakTopics = await Attempt.aggregate([
    { $match: { userId: oid, status: ATTEMPT_STATUS.SUBMITTED } },
    { $unwind: '$result.weakTopics' },
    { $group: { _id: '$result.weakTopics', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 8 },
    { $project: { _id: 0, topic: '$_id', count: 1 } }
  ]);

  const recent = await Attempt.find({ userId: oid, status: ATTEMPT_STATUS.SUBMITTED })
    .sort({ submittedAt: -1 })
    .limit(8)
    .populate('testId', 'title subject')
    .lean();

  const s = summary[0] ?? {};
  const totalTimeSec = Math.round(s.totalTimeSec ?? 0);

  return {
    student: { name: user?.name ?? null, grade: user?.grade ?? grade ?? null },
    streak: user?.streak ?? { count: 0, lastActiveDate: null },
    stats: {
      testsTaken: s.testsTaken ?? 0,
      avgPercentage: round2(s.avgPercentage ?? 0),
      bestPercentage: round2(s.bestPercentage ?? 0),
      passRate: s.testsTaken ? round2(((s.passed ?? 0) / s.testsTaken) * 100) : 0,
      totalTimeSec
    },
    trend,
    weakTopics,
    recent: recent.map((a) => ({
      id: String(a._id),
      testTitle: a.testId?.title ?? 'Deleted test',
      subject: a.testId?.subject ?? null,
      score: a.result?.score ?? 0,
      totalMarks: a.result?.totalMarks ?? 0,
      percentage: a.result?.percentage ?? 0,
      passed: a.result?.passed ?? null,
      submittedAt: a.submittedAt,
      autoSubmitted: a.autoSubmitted
    }))
  };
}

export default {
  classStats,
  studentReport,
  studentHistory,
  questionAnalytics,
  questionDetailStats,
  studentProgress,
  attemptLogs,
  dashboard
};
