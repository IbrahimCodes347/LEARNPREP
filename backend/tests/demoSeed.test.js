import { Attempt } from '../src/models/Attempt.js';
import { Bookmark } from '../src/models/Bookmark.js';
import { Question } from '../src/models/Question.js';
import { Test } from '../src/models/Test.js';
import { User } from '../src/models/User.js';
import { scoreAttempt } from '../src/services/scoreService.js';
import { DEMO_EMAIL_DOMAIN, DEMO_PASSWORD, resetDemo, seedDemo } from '../scripts/seedDemo.js';
import { makeQuestions, makeStudent, makeTest } from './helpers.js';

const DAY_MS = 24 * 60 * 60 * 1000;

const DEMO_EMAIL_REGEX = new RegExp(`@${DEMO_EMAIL_DOMAIN}$`, 'i');
const DEMO_TITLE_REGEX = /^\[Demo\] /;

async function buildBank() {
  const groups = [
    ['Data Structures', ['Trees', 'Graphs', 'Linked Lists']],
    ['Database Management', ['SQL', 'Normalisation', 'Transactions']],
    ['Operating Systems', ['Processes', 'Scheduling', 'Memory']]
  ];
  for (const [subject, topics] of groups) {
    for (let i = 0; i < topics.length; i += 1) {
      const difficulty = ['easy', 'medium', 'hard'][i % 3];
      await makeQuestions(8, { subject, topic: topics[i], difficulty });
    }
  }
}

const demoUserIdList = async () =>
  (await User.find({ email: DEMO_EMAIL_REGEX }).select('_id').lean()).map((u) => u._id);

describe('demo seed', () => {
  beforeEach(async () => {
    await buildBank();
    await seedDemo();
  });

  it('creates exactly 10 demo students', async () => {
    expect(await User.countDocuments({ email: DEMO_EMAIL_REGEX })).toBe(10);
    const students = await User.find({ email: DEMO_EMAIL_REGEX }).select('role').lean();
    expect(students.every((s) => s.role === 'student')).toBe(true);
  });

  it('logs demo students in with the shared demo password', async () => {
    const aarav = await User.findOne({ username: 'aarav.sharma' }).select('+passwordHash');
    await expect(aarav.verifyPassword(DEMO_PASSWORD)).resolves.toBe(true);
  });

  it('creates three [Demo] tests from the real bank with distinct subjects', async () => {
    const tests = await Test.find({ title: DEMO_TITLE_REGEX }).lean();
    expect(tests.length).toBe(3);
    expect(new Set(tests.map((t) => t.subject)).size).toBe(3);
    for (const t of tests) {
      expect(t.questionIds.length).toBeGreaterThanOrEqual(6);
      expect(t.durationMinutes).toBeGreaterThanOrEqual(20);
      expect(t.maxAttempts).toBe(0);
      expect(t.maxTabSwitches).toBe(0);
      expect(t.status).toBe('active');
    }
  });

  it('gives each student the right attempt profile', async () => {
    const pooja = await User.findOne({ username: 'pooja.joshi' }).lean();
    const arjun = await User.findOne({ username: 'arjun.reddy' }).lean();
    const neha = await User.findOne({ username: 'neha.gupta' }).lean();
    const vikram = await User.findOne({ username: 'vikram.nair' }).lean();
    const aarav = await User.findOne({ username: 'aarav.sharma' }).lean();

    expect(await Attempt.countDocuments({ userId: pooja._id, status: 'submitted' })).toBe(1);
    const poojaInProgress = await Attempt.findOne({ userId: pooja._id, status: 'in_progress' }).lean();
    expect(poojaInProgress).toBeTruthy();
    expect(new Date(poojaInProgress.deadlineAt).getTime()).toBeGreaterThan(Date.now());

    expect(await Attempt.countDocuments({ userId: arjun._id })).toBe(0);

    expect(neha.isActive).toBe(false);
    const nehaAttempts = await Attempt.find({ userId: neha._id, status: 'submitted' }).lean();
    expect(nehaAttempts.length).toBeGreaterThan(0);
    expect(nehaAttempts.some((a) => a.submittedAt.getTime() < Date.now() - 7 * DAY_MS)).toBe(true);

    const vikramAttempts = await Attempt.find({ userId: vikram._id, status: 'submitted' }).lean();
    expect(vikramAttempts.find((a) => a.tabSwitchCount === 5)).toBeTruthy();
    expect(vikramAttempts.find((a) => a.tabSwitchCount === 3)).toBeTruthy();
    expect(vikramAttempts.some((a) => a.autoSubmitted)).toBe(true);

    expect(await Attempt.countDocuments({ userId: aarav._id, status: 'submitted' })).toBe(7);
    const aaravUser = await User.findById(aarav._id).lean();
    expect(aaravUser.streak?.count).toBe(7);
  });

  it('stores results identical to the real scoring function', async () => {
    const userIds = await demoUserIdList();
    const attempts = await Attempt.find({ userId: { $in: userIds }, status: 'submitted' }).lean();
    expect(attempts.length).toBeGreaterThan(0);
    for (const a of attempts) {
      const questions = await Question.find({ _id: { $in: a.questionOrder } }).lean();
      const test = await Test.findById(a.testId).lean();
      const calc = scoreAttempt({
        questions,
        responses: a.responses,
        negativeMarks: test.negativeMarks,
        passMarks: test.passMarks
      });
      expect(calc.score).toBe(a.result.score);
      expect(calc.percentage).toBe(a.result.percentage);
      expect(calc.correct).toBe(a.result.correct);
      expect(calc.wrong).toBe(a.result.wrong);
      expect(calc.detail.length).toBe(a.result.detail.length);
    }
  });

  it('has two students tied on the same test with different durations', async () => {
    const vikram = await User.findOne({ username: 'vikram.nair' }).lean();
    const pooja = await User.findOne({ username: 'pooja.joshi' }).lean();
    const vAttempts = await Attempt.find({ userId: vikram._id, status: 'submitted' }).lean();
    const pAttempts = await Attempt.find({ userId: pooja._id, status: 'submitted' }).lean();

    const v = vAttempts.find((va) => pAttempts.some((pa) => String(pa.testId) === String(va.testId)));
    expect(v).toBeTruthy();
    const p = pAttempts.find((pa) => String(pa.testId) === String(v.testId));

    expect(v.result.percentage).toBe(p.result.percentage);
    const vDur = v.submittedAt.getTime() - v.startedAt.getTime();
    const pDur = p.submittedAt.getTime() - p.startedAt.getTime();
    expect(Math.abs(vDur - pDur)).toBeGreaterThan(1000);
  });

  it('creates the planned bookmarks', async () => {
    const riya = await User.findOne({ username: 'riya.patil' }).lean();
    const karan = await User.findOne({ username: 'karan.mehta' }).lean();
    const rohan = await User.findOne({ username: 'rohan.desai' }).lean();
    expect(await Bookmark.countDocuments({ userId: riya._id })).toBe(3);
    expect(await Bookmark.countDocuments({ userId: karan._id })).toBe(2);
    expect(await Bookmark.countDocuments({ userId: rohan._id })).toBe(2);
  });

  it('is idempotent - a second run adds no students, tests or attempts', async () => {
    const before = {
      users: await User.countDocuments({}),
      attempts: await Attempt.countDocuments({}),
      bookmarks: await Bookmark.countDocuments({}),
      demoTests: await Test.countDocuments({ title: DEMO_TITLE_REGEX })
    };

    await seedDemo();

    expect(await User.countDocuments({ email: DEMO_EMAIL_REGEX })).toBe(10);
    expect(await Test.countDocuments({ title: DEMO_TITLE_REGEX })).toBe(before.demoTests);
    expect(await Attempt.countDocuments({})).toBe(before.attempts);
    expect(await Bookmark.countDocuments({})).toBe(before.bookmarks);
    expect(await User.countDocuments({})).toBe(before.users);
  });

  it('reset removes only the demo records', async () => {
    const real = await makeStudent({
      username: 'realstudent',
      name: 'Real Student',
      email: 'realstudent@example.com',
      rollno: 'R001'
    });
    const realTest = await makeTest({ title: 'Real Test' });
    await Bookmark.create({ userId: real._id, questionId: realTest.questionIds[0], note: 'real' });

    const result = await resetDemo();

    expect(result.students).toBe(10);
    expect(result.tests).toBe(3);
    expect(result.attempts).toBeGreaterThan(0);
    expect(await User.countDocuments({ email: DEMO_EMAIL_REGEX })).toBe(0);
    expect(await Test.countDocuments({ title: DEMO_TITLE_REGEX })).toBe(0);
    expect(await User.countDocuments({ username: 'realstudent' })).toBe(1);
    expect(await Test.countDocuments({ title: 'Real Test' })).toBe(1);
    expect(await Bookmark.countDocuments({})).toBe(1);
  });
});