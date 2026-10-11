import request from 'supertest';
import { createApp } from '../src/app.js';
import { Attempt } from '../src/models/Attempt.js';
import { importStudents } from '../src/services/importService.js';
import {
  ATTEMPT_STATUS,
  GRADE_OPTIONS,
  PASS_PERCENTAGE,
  UNASSIGNED_GRADE,
  normalizeGrade
} from '../src/utils/constants.js';
import { studentHistory, studentReport } from '../src/services/analyticsService.js';
import { makeAdmin, makeStudent, makeTest } from './helpers.js';

const app = createApp();

async function adminAgent() {
  const admin = await makeAdmin();
  const agent = request.agent(app);
  await agent.post('/auth/login').send({ identifier: admin.username, password: 'Student@123' });
  return agent;
}

function attempt({
  userId,
  testId,
  percentage,
  weakTopics = [],
  submittedAt = new Date('2026-01-01T09:00:00Z')
}) {
  return Attempt.create({
    userId,
    testId,
    status: ATTEMPT_STATUS.SUBMITTED,
    startedAt: new Date('2026-01-01T08:00:00Z'),
    deadlineAt: new Date('2026-01-01T10:00:00Z'),
    submittedAt,
    result: { score: percentage, totalMarks: 100, percentage, passed: percentage >= PASS_PERCENTAGE, weakTopics }
  });
}

describe('normalizeGrade', () => {
  test('collapses whitespace and matches options case-insensitively', () => {
    expect(normalizeGrade('TYCS Sem V')).toBe('TYCS Sem V');
    expect(normalizeGrade('  tycs   sem  v ')).toBe('TYCS Sem V');
    expect(normalizeGrade('TYCS SEM V')).toBe('TYCS Sem V');
    expect(normalizeGrade('SYCS Sem III')).toBe('SYCS Sem III');
  });

  test('blank becomes null, unknown values are kept verbatim', () => {
    expect(normalizeGrade('')).toBe(null);
    expect(normalizeGrade('   ')).toBe(null);
    expect(normalizeGrade(null)).toBe(null);
    expect(normalizeGrade('10')).toBe('10');
    expect(normalizeGrade('nxx')).toBe('nxx');
    // Not an option at all (III vs V), so it stays visibly distinct for the audit script.
    expect(normalizeGrade('SYCS SEM V')).toBe('SYCS SEM V');
  });
});

describe('studentReport service', () => {
  test('groups by NORMALISED grade, merging case and whitespace variants', async () => {
    const madeUp = await makeStudent({ grade: 'TYCS Sem V' });
    const upper = await makeStudent({ grade: 'TYCS SEM V' });
    const shorthand = await makeStudent({ grade: '   tycs   sem v ' });
    const other = await makeStudent({ grade: 'SYCS Sem III' });
    const test = await makeTest();

    await attempt({ userId: madeUp._id, testId: test._id, percentage: 50 });
    await attempt({ userId: upper._id, testId: test._id, percentage: 60 });
    await attempt({ userId: shorthand._id, testId: test._id, percentage: 70 });
    await attempt({ userId: other._id, testId: test._id, percentage: 80 });

    const { students, summary, classes } = await studentReport({});

    const tycs = students.filter((s) => s.grade === 'TYCS Sem V');
    expect(tycs).toHaveLength(3);
    expect(summary.studentsCount).toBe(4);

    const cls = classes.find((c) => c.grade === 'TYCS Sem V');
    expect(cls.students).toBe(3);
    expect(classes.find((c) => c.grade === 'SYCS Sem III').students).toBe(1);
  });

  test('passes when the AVERAGE across attempts reaches 20, not the best', async () => {
    const avgFails = await makeStudent({ grade: 'SYCS Sem III' });
    const exactBet = await makeStudent({ grade: 'SYCS Sem III' });
    const below = await makeStudent({ grade: 'SYCS Sem III' });
    const test = await makeTest();

    // Best would be 25 (a pass under the old rule), but the average is 17.5 -> fail.
    await attempt({ userId: avgFails._id, testId: test._id, percentage: 10 });
    await attempt({ userId: avgFails._id, testId: test._id, percentage: 25 });
    // Exactly 20 on average -> pass.
    await attempt({ userId: exactBet._id, testId: test._id, percentage: 20 });
    await attempt({ userId: exactBet._id, testId: test._id, percentage: 20 });
    await attempt({ userId: below._id, testId: test._id, percentage: 19.99 });

    const { students, summary, charts } = await studentReport({ grade: 'SYCS Sem III' });

    const byUser = Object.fromEntries(students.map((s) => [s.userId, s]));
    expect(byUser[String(avgFails._id)].status).toBe('failed');
    expect(byUser[String(exactBet._id)].status).toBe('passed');
    expect(byUser[String(below._id)].status).toBe('failed');

    expect(summary).toMatchObject({
      studentsCount: 3,
      attemptsCount: 5,
      passedCount: 1,
      failedCount: 2,
      passRate: 33.33
    });
    expect(charts.passFail).toEqual({ passed: 1, failed: 2 });
  });

  test('summary average is the mean of student averages, not attempts', async () => {
    const s1 = await makeStudent({ grade: 'TYCS Sem IV' });
    const s2 = await makeStudent({ grade: 'TYCS Sem IV' });
    const test = await makeTest();

    // s1 average 20, s2 average 40 -> student-mean 30 (attempt-weighted would be 36.67).
    await attempt({ userId: s1._id, testId: test._id, percentage: 10 });
    await attempt({ userId: s1._id, testId: test._id, percentage: 30 });
    await attempt({ userId: s2._id, testId: test._id, percentage: 40 });

    const { summary, charts } = await studentReport({ grade: 'TYCS Sem IV' });
    expect(summary.avgPercentage).toBe(30);
    expect(charts.avgPerClass).toEqual([]); // hidden when a class is selected
  });

  test('carries per-student metrics, trend, weak topics and recommendation', async () => {
    const student = await makeStudent({ grade: 'SYCS Sem III', rollno: 'R1', username: 'trenduser' });
    const test = await makeTest();

    await attempt({
      userId: student._id,
      testId: test._id,
      percentage: 60,
      weakTopics: ['algebra'],
      submittedAt: new Date('2026-02-01T09:00:00Z')
    });
    await attempt({
      userId: student._id,
      testId: test._id,
      percentage: 50,
      weakTopics: ['algebra', 'probability'],
      submittedAt: new Date('2026-03-01T09:00:00Z')
    });
    await attempt({
      userId: student._id,
      testId: test._id,
      percentage: 40,
      weakTopics: ['algebra', 'probability'],
      submittedAt: new Date('2026-04-01T09:00:00Z')
    });

    const { students } = await studentReport({ grade: 'SYCS Sem III' });
    const s = students.find((x) => x.userId === String(student._id));

    expect(s).toMatchObject({
      name: student.name,
      username: 'trenduser',
      rollno: 'R1',
      grade: 'SYCS Sem III',
      attemptsCount: 3,
      avgPercentage: 50,
      bestPercentage: 60,
      lastPercentage: 40,
      status: 'passed',
      trend: 'down'
    });
    // algebra counts 3, probability 2 -> top two in that order.
    expect(s.weakTopics).toEqual(['algebra', 'probability']);
    // Last 3 strictly declining and average >= 20 -> attention (decline) rule.
    expect(s.recommendation.level).toBe('attention');
    expect(s.recommendation.message).toContain('strictly declined');
    expect(s.recommendation.message).toContain('Weak areas: algebra, probability');
  });

  test('an increasing student is on track and an at-risk count feeds the summary', async () => {
    const climbing = await makeStudent({ grade: 'TYCS Sem V' });
    const test = await makeTest();
    for (const percentage of [30, 50, 70]) {
      await attempt({ userId: climbing._id, testId: test._id, percentage });
    }

    const { students, summary } = await studentReport({ grade: 'TYCS Sem V' });
    const s = students[0];
    expect(s.trend).toBe('up');
    expect(s.recommendation.level).toBe('on_track');
    expect(summary.atRiskCount).toBe(0);
    expect(summary.passRate).toBe(100);
  });

  test('legacy junk grades are excluded; blanks still group under Unassigned', async () => {
    const blank = await makeStudent({ grade: null });
    const junk = await makeStudent({ grade: '10' });
    const test = await makeTest();
    await attempt({ userId: blank._id, testId: test._id, percentage: 15 });
    await attempt({ userId: junk._id, testId: test._id, percentage: 60 });

    const { students, classes, summary } = await studentReport({});
    const unassigned = students.find((s) => s.grade === UNASSIGNED_GRADE);
    expect(unassigned).toBeDefined();
    expect(unassigned.status).toBe('failed'); // avg 15 < 20
    // A grade outside the allowlist forms no bucket and its attempts do not count.
    expect(students.find((s) => s.userId === String(junk._id))).toBeUndefined();
    expect(classes.find((c) => c.grade === '10')).toBeUndefined();
    expect(classes).toEqual([{ grade: UNASSIGNED_GRADE, students: 1 }]);
    expect(summary.studentsCount).toBe(1);
    expect(summary.attemptsCount).toBe(1);
  });

  test('admin and faculty attempts never count', async () => {
    const admin = await makeAdmin();
    const student = await makeStudent();
    const test = await makeTest();
    await attempt({ userId: admin._id, testId: test._id, percentage: 95 });
    await attempt({ userId: student._id, testId: test._id, percentage: 40 });

    const { students, summary } = await studentReport({});
    expect(students).toHaveLength(1);
    expect(students[0].userId).toBe(String(student._id));
    expect(summary.studentsCount).toBe(1);
  });

  test('search narrows rows but not summary or charts; status filters rows too', async () => {
    const ana = await makeStudent({ grade: 'SYCS Sem III', name: 'Ana Thomas' });
    const bob = await makeStudent({ grade: 'SYCS Sem III', name: 'Bob Drew' });
    const test = await makeTest();
    await attempt({ userId: ana._id, testId: test._id, percentage: 25 });
    await attempt({ userId: bob._id, testId: test._id, percentage: 10 });

    const searched = await studentReport({ grade: 'SYCS Sem III', search: 'ana' });
    expect(searched.students).toHaveLength(1);
    expect(searched.students[0].name).toBe('Ana Thomas');
    // Summary is still the whole class.
    expect(searched.summary.studentsCount).toBe(2);
    expect(searched.charts.passFail).toEqual({ passed: 1, failed: 1 });

    const failed = await studentReport({ grade: 'SYCS Sem III', status: 'failed' });
    expect(failed.students).toHaveLength(1);
    expect(failed.students[0].name).toBe('Bob Drew');
    expect(failed.total).toBe(1);
    // Status does not change the class summary either.
    expect(failed.summary.studentsCount).toBe(2);
  });

  test('sorts by name asc/desc and paginates', async () => {
    const test = await makeTest();
    let submittedAt = Date.UTC(2026, 0, 1, 9, 0, 0);
    for (const [name, pct] of [
      ['Zara', 70],
      ['Amit', 30],
      ['Meera', 50]
    ]) {
      const s = await makeStudent({ grade: 'TYCS Sem IV', name });
      await attempt({
        userId: s._id,
        testId: test._id,
        percentage: pct,
        submittedAt: new Date((submittedAt += 60_000))
      });
    }

    const asc = await studentReport({ grade: 'TYCS Sem IV', sortBy: 'name', sortDir: 'asc' });
    expect(asc.students.map((s) => s.name)).toEqual(['Amit', 'Meera', 'Zara']);

    const page2 = await studentReport({ grade: 'TYCS Sem IV', limit: 2, page: 2 });
    expect(page2.total).toBe(3);
    expect(page2.students).toHaveLength(1);
    expect(page2.students[0].name).toBe('Amit'); // default sort avgPercentage desc: Zara, Meera, Amit
  });

  test('score distribution buckets by student average', async () => {
    const test = await makeTest();
    const pctToStudent = { 15: 'low', 25: 'mid', 100: 'top' };
    for (const [pct, tag] of Object.entries(pctToStudent)) {
      const s = await makeStudent({ grade: 'SYCS Sem III', name: tag });
      await attempt({ userId: s._id, testId: test._id, percentage: Number(pct) });
    }

    const { charts } = await studentReport({ grade: 'SYCS Sem III' });
    const bucket = (range) => charts.scoreDistribution.find((b) => b.range === range).students;
    expect(bucket('0-20')).toBe(1); // 15
    expect(bucket('20-40')).toBe(1); // 25
    expect(bucket('80-100')).toBe(1); // 100
    expect(bucket('40-60')).toBe(0);
    expect(bucket('60-80')).toBe(0);
  });

  test('avg per class chart appears when no class is selected', async () => {
    const s1 = await makeStudent({ grade: 'SYCS Sem III' });
    const s2 = await makeStudent({ grade: 'TYCS Sem V' });
    const test = await makeTest();
    await attempt({ userId: s1._id, testId: test._id, percentage: 20 });
    await attempt({ userId: s2._id, testId: test._id, percentage: 80 });

    const { charts } = await studentReport({});
    expect(charts.avgPerClass).toEqual([
      { grade: 'SYCS Sem III', avgPercentage: 20 },
      { grade: 'TYCS Sem V', avgPercentage: 80 }
    ]);
  });

  test('filters by testId for a per-test report', async () => {
    const student = await makeStudent({ grade: 'TYCS Sem V' });
    const testX = await makeTest();
    const testY = await makeTest();
    await attempt({ userId: student._id, testId: testX._id, percentage: 30 });
    await attempt({ userId: student._id, testId: testY._id, percentage: 90 });

    const { students, summary } = await studentReport({ testId: String(testX._id) });
    expect(students[0].attemptsCount).toBe(1);
    expect(students[0].avgPercentage).toBe(30);
    expect(summary.attemptsCount).toBe(1);
  });

  test('ignores in-progress attempts', async () => {
    const student = await makeStudent();
    const test = await makeTest();
    await attempt({ userId: student._id, testId: test._id, percentage: 80 });
    await Attempt.create({
      userId: student._id,
      testId: test._id,
      status: ATTEMPT_STATUS.IN_PROGRESS,
      startedAt: new Date('2026-01-01T09:00:00Z'),
      deadlineAt: new Date('2026-01-01T09:30:00Z')
    });

    const { students, summary } = await studentReport({});
    expect(students[0].attemptsCount).toBe(1);
    expect(summary.attemptsCount).toBe(1);
  });

  test('zeroes out an empty database', async () => {
    const { students, total, summary, charts, classes, passPercentage } = await studentReport({});

    expect(students).toEqual([]);
    expect(total).toBe(0);
    expect(charts.passFail).toEqual({ passed: 0, failed: 0 });
    expect(summary).toEqual({
      studentsCount: 0,
      attemptsCount: 0,
      avgPercentage: 0,
      passedCount: 0,
      failedCount: 0,
      passRate: 0,
      atRiskCount: 0
    });
    expect(charts.scoreDistribution.length).toBe(5);
    expect(classes).toEqual([]);
    expect(passPercentage).toBe(PASS_PERCENTAGE);
  });
});

describe('studentHistory service', () => {
  test('returns attempts oldest-first with titles and attempt numbering', async () => {
    const student = await makeStudent();
    const test = await makeTest();
    await attempt({
      userId: student._id,
      testId: test._id,
      percentage: 30,
      submittedAt: new Date('2026-05-01T09:00:00Z')
    });
    await attempt({
      userId: student._id,
      testId: test._id,
      percentage: 70,
      submittedAt: new Date('2026-06-01T09:00:00Z')
    });

    const data = await studentHistory({ userId: String(student._id) });
    expect(data.student.grade).toBe('TYCS Sem V');
    expect(data.history.map((h) => [h.attempt, h.percentage, h.testTitle])).toEqual([
      [1, 30, test.title],
      [2, 70, test.title]
    ]);
  });

  test('returns null when the id is not a student', async () => {
    const admin = await makeAdmin();
    const data = await studentHistory({ userId: String(admin._id) });
    expect(data).toBe(null);
  });
});

describe('grade validation (prevention)', () => {
  test('admin create rejects a grade outside the allowlist', async () => {
    const agent = await adminAgent();
    const base = { name: 'Junk', username: 'junkgrade', password: 'Student@123', rollno: 'JG1' };

    for (const grade of ['t', '10', 'nxx', 'SYCS SEM V']) {
      const res = await agent.post('/admin/students').send({ ...base, grade });
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(JSON.stringify(res.body)).toContain('Class must be one of');
    }
  });

  test('a case/space variant of an option is accepted and stored canonically', async () => {
    const agent = await adminAgent();
    const res = await agent.post('/admin/students').send({
      name: 'Canon',
      username: 'canonical',
      password: 'Student@123',
      rollno: 'CN1',
      grade: '  tycs   sem v '
    });
    expect(res.status).toBe(201);
    expect(res.body.data.student.grade).toBe('TYCS Sem V');
  });

  test('self-register rejects a junk grade too', async () => {
    const res = await request(app).post('/auth/register').send({
      name: 'Junk Register',
      username: 'junkreg',
      password: 'Student@123',
      rollno: 'JR1',
      grade: 'x'
    });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('CSV bulk import rejects a bad grade row without blocking others', async () => {
    const csv = [
      'name,username,email,rollno,password,grade',
      'Good Row,goodrow,,G1,Student@123,TYCS SEM V',
      'Bad Row,badrow,,G2,Student@123,t'
    ].join('\n');
    const result = await importStudents({
      buffer: Buffer.from(csv),
      filename: 'students.csv',
      createdBy: null
    });

    expect(result.total).toBe(2);
    expect(result.createdCount).toBe(1);
    expect(result.errorCount).toBe(1);
    expect(result.created[0].name).toBe('Good Row');
    expect(result.errors[0].message).toContain('Class must be one of');
  });
});

describe('GET /admin/reports/students', () => {
  test('admin gets the student-level report with summary, charts, classes and passPercentage', async () => {
    const agent = await adminAgent();
    const student = await makeStudent({ grade: 'TYCS Sem V' });
    const test = await makeTest();
    await attempt({ userId: student._id, testId: test._id, percentage: 88 });

    const res = await agent.get('/admin/reports/students');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.students).toHaveLength(1);
    expect(res.body.data.students[0]).toMatchObject({
      grade: 'TYCS Sem V',
      avgPercentage: 88,
      status: 'passed'
    });
    expect(res.body.data.summary.studentsCount).toBe(1);
    expect(res.body.data.charts.passFail.passed).toBe(1);
    expect(res.body.data.classes).toEqual([{ grade: 'TYCS Sem V', students: 1 }]);
    expect(res.body.data.passPercentage).toBe(20);
  });

  test('rejects invalid query values instead of crashing', async () => {
    const agent = await adminAgent();
    const badSort = await agent.get('/admin/reports/students?sortBy=bogus');
    expect(badSort.status).toBe(400);
    const badStatus = await agent.get('/admin/reports/students?status=maybe');
    expect(badStatus.status).toBe(400);
    const badTest = await agent.get('/admin/reports/students?testId=not-an-id');
    expect(badTest.status).toBe(400);
  });

  test('student gets 403', async () => {
    const student = await makeStudent();
    const agent = request.agent(app);
    await agent.post('/auth/login').send({ identifier: student.username, password: 'Student@123' });

    const res = await agent.get('/admin/reports/students');
    expect(res.status).toBe(403);
  });
});

describe('GET /admin/reports/students/:id/history', () => {
  test('returns the ordered history with the pass bar untouched by per-test pass marks', async () => {
    const agent = await adminAgent();
    const student = await makeStudent();
    const test = await makeTest();
    await attempt({ userId: student._id, testId: test._id, percentage: 40 });

    const res = await agent.get(`/admin/reports/students/${student._id}/history`);
    expect(res.status).toBe(200);
    expect(res.body.data.student.id).toBe(String(student._id));
    expect(res.body.data.history).toHaveLength(1);
    expect(res.body.data.history[0]).toMatchObject({ attempt: 1, testTitle: test.title, percentage: 40 });
  });

  test('404 for a missing or admin id, 400 for an invalid id, 403 for students', async () => {
    const agent = await adminAgent();
    const missing = await agent.get('/admin/reports/students/000000000000000000000000/history');
    expect(missing.status).toBe(404);

    const invalid = await agent.get('/admin/reports/students/nope/history');
    expect(invalid.status).toBe(400);

    const admin = await makeAdmin();
    const adminRes = await agent.get(`/admin/reports/students/${admin._id}/history`);
    expect(adminRes.status).toBe(404);

    const student = await makeStudent();
    const studentAgent = request.agent(app);
    await studentAgent.post('/auth/login').send({ identifier: student.username, password: 'Student@123' });
    const forbidden = await studentAgent.get(`/admin/reports/students/${student._id}/history`);
    expect(forbidden.status).toBe(403);
  });
});

describe('GET /config', () => {
  test('is public and exposes the allowed classes and pass mark', async () => {
    const res = await request(app).get('/config');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.gradeOptions).toEqual(GRADE_OPTIONS);
    expect(res.body.data.passPercentage).toBe(20);
    expect(res.body.data.unassignedGrade).toBe(UNASSIGNED_GRADE);
  });
});