import { beforeEach, describe, expect, jest, test } from '@jest/globals';

const mockTransporter = { sendMail: jest.fn(), verify: jest.fn() };
const mockCreateTransport = jest.fn(() => mockTransporter);
const mockUserFindById = jest.fn();
const mockUserFind = jest.fn();
const mockUserUpdateOne = jest.fn();
const mockAttemptFindOneAndUpdate = jest.fn();
const mockGetLeaderboard = jest.fn();

function registerMocks(envOverrides = {}) {
  const env = {
    EMAIL_ENABLED: true,
    EMAIL_USER: 'demo.sender@gmail.com',
    EMAIL_PASS: 'app-password-here',
    EMAIL_HOST: 'smtp.gmail.com',
    EMAIL_PORT: 587,
    EMAIL_SECURE: false,
    EMAIL_FROM: '',
    ...envOverrides
  };

  jest.unstable_mockModule('nodemailer', () => ({
    default: { createTransport: mockCreateTransport },
    createTransport: mockCreateTransport
  }));
  jest.unstable_mockModule('../src/config/env.js', () => ({ env, default: env }));
  jest.unstable_mockModule('../src/utils/logger.js', () => ({
    createLogger: () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() })
  }));
  jest.unstable_mockModule('../src/models/User.js', () => ({
    User: { findById: mockUserFindById, find: mockUserFind, updateOne: mockUserUpdateOne },
    default: { findById: mockUserFindById, find: mockUserFind, updateOne: mockUserUpdateOne }
  }));
  jest.unstable_mockModule('../src/models/Attempt.js', () => ({
    Attempt: { findOneAndUpdate: mockAttemptFindOneAndUpdate },
    default: { findOneAndUpdate: mockAttemptFindOneAndUpdate }
  }));
  jest.unstable_mockModule('../src/services/leaderboardService.js', () => ({
    getLeaderboard: mockGetLeaderboard,
    default: { getLeaderboard: mockGetLeaderboard }
  }));
}

function mockUser(user) {
  mockUserFindById.mockReturnValueOnce({
    select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValueOnce(user) })
  });
}

function loadEmail() {
  return import('../src/services/emailService.js');
}

beforeEach(() => {
  jest.resetAllMocks(); // clears calls, implementations AND once-queues
  jest.resetModules();
  mockCreateTransport.mockImplementation(() => mockTransporter);
});

const RESULT = { score: 8, totalMarks: 10, percentage: 80, correct: 4, wrong: 2, unattempted: 1, weakTopics: ['Trees', 'Graphs'], passed: true };

describe('emailService (nodemailer mocked)', () => {
  test('(a) disabled mode sends nothing and never touches the DB', async () => {
    registerMocks({ EMAIL_ENABLED: false });
    const email = await loadEmail();

    const result = await email.sendResultEmail({ attemptId: 'a', userId: 'u', test: { title: 'T' }, result: RESULT });
    expect(result.sent).toBe(false);
    expect(mockTransporter.sendMail).not.toHaveBeenCalled();
    expect(mockAttemptFindOneAndUpdate).not.toHaveBeenCalled();
    expect(mockUserFindById).not.toHaveBeenCalled();

    mockUser({ name: 'A', email: 'a@b.com' });
    const welcome = await email.sendWelcomeEmail({ userId: 'u' });
    expect(welcome.sent).toBe(false);
    expect(mockTransporter.sendMail).not.toHaveBeenCalled();
  });

  test('(b) enabled mode sends a result email with correct subject, to, text and html', async () => {
    registerMocks();
    const email = await loadEmail();

    mockAttemptFindOneAndUpdate.mockResolvedValueOnce({ _id: 'a' });
    mockUser({ name: 'Aarav Sharma', email: 'aarav@example.com' });
    mockGetLeaderboard.mockResolvedValueOnce({ entries: [{ attemptId: 'a', rank: 2 }], totalParticipants: 5 });

    const res = await email.sendResultEmail({
      attemptId: 'a',
      userId: 'u',
      test: { title: 'DB <Mock> Test' },
      result: RESULT
    });

    expect(res.sent).toBe(true);
    expect(mockCreateTransport).toHaveBeenCalledWith({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      auth: { user: 'demo.sender@gmail.com', pass: 'app-password-here' }
    });

    const sent = mockTransporter.sendMail.mock.calls[0][0];
    expect(sent.to).toBe('aarav@example.com');
    expect(sent.from).toBe('demo.sender@gmail.com');
    expect(sent.subject).toBe('LearnPrep result - DB <Mock> Test');
    expect(sent.text).toContain('Score: 8 / 10 (80%)');
    expect(sent.text).toContain('Correct: 4');
    expect(sent.text).toContain('Rank: #2 of 5');
    expect(sent.html).toContain('8 / 10 (80%)');
    expect(sent.html).toContain('Trees, Graphs');
    expect(sent.html).toContain('&lt;Mock&gt;'); // title escaped in HTML
    expect(sent.html).not.toContain('<Mock>');
    expect(mockAttemptFindOneAndUpdate).toHaveBeenCalledWith(
      { _id: 'a', 'result.emailSentAt': null },
      { $set: { 'result.emailSentAt': expect.any(Date) } }
    );
  });

  test('(c) a send failure is logged and never throws to the caller', async () => {
    registerMocks();
    const email = await loadEmail();

    mockAttemptFindOneAndUpdate.mockResolvedValueOnce({ _id: 'a' });
    mockUser({ name: 'A', email: 'a@b.com' });
    mockGetLeaderboard.mockResolvedValueOnce({ entries: [], totalParticipants: 1 });
    mockTransporter.sendMail.mockRejectedValueOnce(new Error('SMTP 550'));

    const res = await email.sendResultEmail({ attemptId: 'a', userId: 'u', test: { title: 'T' }, result: RESULT });
    expect(res.sent).toBe(false);
    expect(res.reason).toBe('send-failed');

    mockUser({ name: 'A', email: 'a@b.com' });
    mockTransporter.sendMail.mockRejectedValueOnce(new Error('SMTP 550'));
    const welcome = await email.sendWelcomeEmail({ userId: 'u' });
    expect(welcome.sent).toBe(false);
    expect(welcome.reason).toBe('send-failed');
  });

  test('(d) the same attempt is never emailed twice (idempotency claim)', async () => {
    registerMocks();
    const email = await loadEmail();

    mockAttemptFindOneAndUpdate.mockResolvedValueOnce({ _id: 'a' });
    mockUser({ name: 'A', email: 'a@b.com' });
    mockGetLeaderboard.mockResolvedValueOnce({ entries: [{ attemptId: 'a', rank: 1 }], totalParticipants: 1 });
    const first = await email.sendResultEmail({ attemptId: 'a', userId: 'u', test: { title: 'T' }, result: RESULT });
    expect(first.sent).toBe(true);

    mockAttemptFindOneAndUpdate.mockResolvedValueOnce(null); // emailSentAt already set
    const second = await email.sendResultEmail({ attemptId: 'a', userId: 'u', test: { title: 'T' }, result: RESULT });
    expect(second.sent).toBe(false);
    expect(second.reason).toBe('already-sent');

    expect(mockTransporter.sendMail).toHaveBeenCalledTimes(1);
  });

  test('(e) users without a valid email are skipped silently', async () => {
    registerMocks();
    const email = await loadEmail();

    mockAttemptFindOneAndUpdate.mockResolvedValueOnce({ _id: 'a' });
    mockUser(null);
    const res = await email.sendResultEmail({ attemptId: 'a', userId: 'u', test: { title: 'T' }, result: RESULT });
    expect(res.sent).toBe(false);
    expect(res.reason).toBe('no-email');
    expect(mockTransporter.sendMail).not.toHaveBeenCalled();

    mockUser({ name: 'X', email: null });
    const welcome = await email.sendWelcomeEmail({ userId: 'u' });
    expect(welcome.sent).toBe(false);
    expect(welcome.reason).toBe('no-email');
    expect(mockTransporter.sendMail).not.toHaveBeenCalled();
  });

  test('welcome email is a short account email to the user address', async () => {
    registerMocks();
    const email = await loadEmail();

    mockUser({ name: 'Riya Patil', email: 'riya@example.com' });
    const res = await email.sendWelcomeEmail({ userId: 'u' });
    expect(res.sent).toBe(true);
    const sent = mockTransporter.sendMail.mock.calls[0][0];
    expect(sent.subject).toBe('Welcome to LearnPrep');
    expect(sent.to).toBe('riya@example.com');
    expect(sent.text).toContain('Riya Patil');
  });

  test('streak reminders fire once per student per day', async () => {
    registerMocks();
    const email = await loadEmail();

    mockUserFind.mockReturnValueOnce({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValueOnce([
          { _id: 'u1', name: 'A', email: 'a@b.com' },
          { _id: 'u2', name: 'B', email: 'b@c.com' }
        ])
      })
    });
    mockUserUpdateOne.mockResolvedValue({ ok: 1 });

    const res = await email.sendMissedDayReminders(new Date('2026-10-10T12:00:00Z'));
    expect(res.sent).toBe(2);
    expect(mockTransporter.sendMail).toHaveBeenCalledTimes(2);
    expect(mockUserUpdateOne).toHaveBeenCalledWith({ _id: 'u1' }, { $set: { reminderSentOn: '2026-10-10' } });
    expect(mockUserUpdateOne).toHaveBeenCalledWith({ _id: 'u2' }, { $set: { reminderSentOn: '2026-10-10' } });
  });

  test('verifyEmailSetup resolves ok and never rejects on failure', async () => {
    registerMocks();
    const email = await loadEmail();

    mockTransporter.verify.mockResolvedValueOnce(true);
    expect(await email.verifyEmailSetup()).toEqual({ ok: true });

    mockTransporter.verify.mockRejectedValueOnce(new Error('Invalid login'));
    expect(await email.verifyEmailSetup()).toEqual({ ok: false, reason: 'Invalid login' });
  });
});