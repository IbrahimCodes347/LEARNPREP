import request from 'supertest';
import { createApp } from '../src/app.js';
import { Attempt } from '../src/models/Attempt.js';
import { startAttempt, saveAnswer, finalizeAttempt, submitAttempt } from '../src/services/attemptService.js';
import { runOnce } from '../src/jobs/autoSubmitJob.js';
import { makeAdmin, makeQuestion, makeStudent, makeTest } from './helpers.js';

const app = createApp();

async function agentFor(user) {
  const agent = request.agent(app);
  await agent.post('/auth/login').send({ identifier: user.username, password: 'Student@123' });
  return agent;
}

describe('startAttempt idempotency', () => {
  test('calling start twice returns the same attempt id', async () => {
    const student = await makeStudent();
    const test = await makeTest({ count: 4 });

    const first = await startAttempt({ user: student, testId: String(test._id) });
    const second = await startAttempt({ user: student, testId: String(test._id) });

    expect(String(second.attempt._id)).toBe(String(first.attempt._id));
    expect(first.resumed).toBe(false);
    expect(second.resumed).toBe(true);
    expect(await Attempt.countDocuments({ userId: student._id, testId: test._id })).toBe(1);
  });

  test('concurrent starts still produce exactly one attempt', async () => {
    const student = await makeStudent();
    const test = await makeTest({ count: 4 });

    const results = await Promise.allSettled([
      startAttempt({ user: student, testId: String(test._id) }),
      startAttempt({ user: student, testId: String(test._id) }),
      startAttempt({ user: student, testId: String(test._id) })
    ]);

    const ids = new Set(
      results.filter((r) => r.status === 'fulfilled').map((r) => String(r.value.attempt._id))
    );

    expect(ids.size).toBe(1);
    expect(await Attempt.countDocuments({ userId: student._id, testId: test._id })).toBe(1);
  });

  test('the response never contains correctIndex or explanation', async () => {
    const student = await makeStudent();
    const test = await makeTest({ count: 3 });

    const { attempt } = await startAttempt({ user: student, testId: String(test._id) });
    const res = await agentFor(student);
    const body = await res.post(`/tests/${test._id}/start`);

    expect(body.status).toBe(200);
    for (const question of body.body.data.questions) {
      expect(question.correctIndex).toBeUndefined();
      expect(question.explanation).toBeUndefined();
      expect(question.difficulty).toBeUndefined();
      expect(question.subject).toBeTruthy();
      expect(question.topic).toBeTruthy();
      expect(typeof question.marks).toBe('number');
      expect(question.options).toBeInstanceOf(Array);
    }
    expect(attempt.questionOrder).toHaveLength(3);
  });

  test('responses are pre-filled with selectedIndex null', async () => {
    const student = await makeStudent();
    const test = await makeTest({ count: 5 });
    const { attempt } = await startAttempt({ user: student, testId: String(test._id) });

    expect(attempt.responses).toHaveLength(5);
    expect(attempt.responses.every((r) => r.selectedIndex === null)).toBe(true);
  });

  test('deadlineAt is now + durationMinutes', async () => {
    const student = await makeStudent();
    const test = await makeTest({ count: 2, durationMinutes: 15 });
    const { attempt } = await startAttempt({ user: student, testId: String(test._id) });

    const diffMin = (new Date(attempt.deadlineAt) - new Date(attempt.startedAt)) / 60000;
    expect(diffMin).toBeCloseTo(15, 1);
  });

  test('a deactivated student cannot start', async () => {
    const student = await makeStudent({ isActive: false });
    const test = await makeTest({ count: 2 });
    await expect(startAttempt({ user: student, testId: String(test._id) })).rejects.toThrow(/deactivated/i);
  });

  test('a draft test cannot be started', async () => {
    const student = await makeStudent();
    const test = await makeTest({ count: 2, status: 'draft' });
    await expect(startAttempt({ user: student, testId: String(test._id) })).rejects.toThrow(/not currently available/i);
  });

  test('a test outside its window cannot be started', async () => {
    const student = await makeStudent();
    const test = await makeTest({
      count: 2,
      activeFrom: new Date(Date.now() + 3600_000),
      activeUntil: new Date(Date.now() + 7200_000)
    });
    await expect(startAttempt({ user: student, testId: String(test._id) })).rejects.toThrow(/not currently available/i);
  });

  test('an invalid test id is a 400, not a CastError 500', async () => {
    const student = await makeStudent();
    const res = await agentFor(student).then((a) => a.post('/tests/not-an-id/start'));
    expect(res.status).toBe(400);
  });
});

describe('saving answers', () => {
  test('saves an answer and updates only that question', async () => {
    const student = await makeStudent();
    const test = await makeTest({ count: 3 });
    const { attempt } = await startAttempt({ user: student, testId: String(test._id) });
    const [first, second] = attempt.questionOrder;

    await saveAnswer({ attemptId: attempt._id, user: student, questionId: first, selectedIndex: 2, timeSpentSec: 30 });

    const fresh = await Attempt.findById(attempt._id).lean();
    expect(fresh.responses.find((r) => String(r.questionId) === String(first._id)).selectedIndex).toBe(2);
    expect(fresh.responses.find((r) => String(r.questionId) === String(second._id)).selectedIndex).toBeNull();
  });

  test('saving after the deadline + grace is rejected with 400', async () => {
    const student = await makeStudent();
    const test = await makeTest({ count: 2, durationMinutes: 1 });
    const { attempt } = await startAttempt({ user: student, testId: String(test._id) });

    const late = new Date(new Date(attempt.deadlineAt).getTime() + 30_000);
    await expect(
      saveAnswer({
        attemptId: attempt._id,
        user: student,
        questionId: attempt.questionOrder[0],
        selectedIndex: 0,
        timeSpentSec: 0,
        now: late
      })
    ).rejects.toMatchObject({ status: 400 });
  });

  test('a save inside the 5 second grace window is still accepted', async () => {
    const student = await makeStudent();
    const test = await makeTest({ count: 2, durationMinutes: 1 });
    const { attempt } = await startAttempt({ user: student, testId: String(test._id) });

    const withinGrace = new Date(new Date(attempt.deadlineAt).getTime() + 3000);
    const saved = await saveAnswer({
      attemptId: attempt._id,
      user: student,
      questionId: attempt.questionOrder[0],
      selectedIndex: 0,
      timeSpentSec: 0,
      now: withinGrace
    });

    expect(saved.selectedIndex).toBe(0);
  });

  test('a question outside the attempt is rejected', async () => {
    const student = await makeStudent();
    const test = await makeTest({ count: 2 });
    const outsider = await makeQuestion();
    const { attempt } = await startAttempt({ user: student, testId: String(test._id) });

    await expect(
      saveAnswer({ attemptId: attempt._id, user: student, questionId: outsider._id, selectedIndex: 0 })
    ).rejects.toThrow(/does not belong/i);
  });

  test('an out-of-range option index is rejected', async () => {
    const student = await makeStudent();
    const test = await makeTest({ count: 2 });
    const { attempt } = await startAttempt({ user: student, testId: String(test._id) });

    await expect(
      saveAnswer({ attemptId: attempt._id, user: student, questionId: attempt.questionOrder[0], selectedIndex: 99 })
    ).rejects.toMatchObject({ status: 400 });
  });

  test('another student cannot save into this attempt', async () => {
    const owner = await makeStudent();
    const intruder = await makeStudent();
    const test = await makeTest({ count: 2 });
    const { attempt } = await startAttempt({ user: owner, testId: String(test._id) });

    await expect(
      saveAnswer({ attemptId: attempt._id, user: intruder, questionId: attempt.questionOrder[0], selectedIndex: 0 })
    ).rejects.toThrow(/Not your attempt/i);
  });

  test('saving after submission is rejected', async () => {
    const student = await makeStudent();
    const test = await makeTest({ count: 2 });
    const { attempt } = await startAttempt({ user: student, testId: String(test._id) });
    await finalizeAttempt({ attemptId: attempt._id, auto: false, emit: false });

    await expect(
      saveAnswer({ attemptId: attempt._id, user: student, questionId: attempt.questionOrder[0], selectedIndex: 0 })
    ).rejects.toMatchObject({ status: 409 });
  });

  test('the API rejects a malformed answer payload', async () => {
    const student = await makeStudent();
    const test = await makeTest({ count: 2 });
    const { attempt } = await startAttempt({ user: student, testId: String(test._id) });
    const agent = await agentFor(student);

    const res = await agent.patch(`/attempts/${attempt._id}/answers`).send({
      questionId: String(attempt.questionOrder[0]),
      selectedIndex: -1
    });

    expect(res.status).toBe(400);
  });
});

describe('finalization', () => {
  test('scoring uses saved server-side answers, not a client payload', async () => {
    const student = await makeStudent();
    const questions = [
      await makeQuestion({ correctIndex: 0, marks: 1 }),
      await makeQuestion({ correctIndex: 1, marks: 2 })
    ];
    const test = await makeTest({
      questionIds: questions.map((q) => q._id),
      shuffle: false,
      totalMarks: 3
    });

    const { attempt } = await startAttempt({ user: student, testId: String(test._id) });
    await saveAnswer({
      attemptId: attempt._id,
      user: student,
      questionId: questions[0]._id,
      selectedIndex: 0
    });
    await saveAnswer({
      attemptId: attempt._id,
      user: student,
      questionId: questions[1]._id,
      selectedIndex: 1
    });

    const { attempt: final } = await finalizeAttempt({ attemptId: attempt._id, emit: false });

    expect(final.status).toBe('submitted');
    expect(final.result.score).toBe(3);
    expect(final.result.correct).toBe(2);
    expect(final.result.wrong).toBe(0);
    expect(final.result.percentage).toBe(100);
  });

  test('finalizing twice returns the same result with no double write', async () => {
    const student = await makeStudent();
    const test = await makeTest({ count: 3 });
    const { attempt } = await startAttempt({ user: student, testId: String(test._id) });
    await saveAnswer({ attemptId: attempt._id, user: student, questionId: attempt.questionOrder[0], selectedIndex: 0 });

    const first = await finalizeAttempt({ attemptId: attempt._id, emit: false });
    const submittedAt = first.attempt.submittedAt.getTime();
    const second = await finalizeAttempt({ attemptId: attempt._id, emit: false });

    expect(second.alreadyFinalized).toBe(true);
    expect(second.attempt.result.score).toBe(first.attempt.result.score);
    expect(second.attempt.submittedAt.getTime()).toBe(submittedAt);
    expect(await Attempt.countDocuments({ _id: attempt._id, status: 'submitted' })).toBe(1);
  });

  test('concurrent submits still produce exactly one finalization', async () => {
    const student = await makeStudent();
    const test = await makeTest({ count: 2 });
    const { attempt } = await startAttempt({ user: student, testId: String(test._id) });

    await Promise.allSettled([
      submitAttempt({ attemptId: attempt._id, user: student }),
      submitAttempt({ attemptId: attempt._id, user: student }),
      finalizeAttempt({ attemptId: attempt._id, emit: false })
    ]);

    const docs = await Attempt.find({ _id: attempt._id }).lean();
    expect(docs).toHaveLength(1);
    expect(docs[0].status).toBe('submitted');
    expect(docs[0].submittedAt).toBeTruthy();
  });

  test('submitting past the deadline is flagged autoSubmitted', async () => {
    const student = await makeStudent();
    const test = await makeTest({ count: 2, durationMinutes: 1 });
    const { attempt } = await startAttempt({ user: student, testId: String(test._id) });

    const future = new Date(new Date(attempt.deadlineAt).getTime() + 60_000);
    const { attempt: final } = await finalizeAttempt({ attemptId: attempt._id, auto: true, emit: false });

    expect(final.autoSubmitted).toBe(true);
    expect(future.getTime()).toBeGreaterThan(new Date(attempt.deadlineAt).getTime());
  });

  test('submitting updates the student streak', async () => {
    const student = await makeStudent();
    const test = await makeTest({ count: 2 });
    const { attempt } = await startAttempt({ user: student, testId: String(test._id) });
    await finalizeAttempt({ attemptId: attempt._id, emit: false });

    const fresh = await (await import('../src/models/User.js')).User.findById(student._id).lean();
    expect(fresh.streak.count).toBe(1);
    expect(fresh.streak.lastActiveDate).toBeTruthy();
  });

  test('the result endpoint reveals answers only after submission', async () => {
    const student = await makeStudent();
    const test = await makeTest({ count: 2 });
    const { attempt } = await startAttempt({ user: student, testId: String(test._id) });
    const agent = await agentFor(student);

    const early = await agent.get(`/attempts/${attempt._id}/result`);
    expect(early.status).toBe(409);

    await agent.post(`/attempts/${attempt._id}/submit`);

    const res = await agent.get(`/attempts/${attempt._id}/result`);
    expect(res.status).toBe(200);
    expect(res.body.data.result.detail).toHaveLength(2);
    expect(res.body.data.result.detail[0].correctIndex).toBeDefined();
    expect(res.body.data.result.detail[0].explanation).toBeDefined();
  });

  test('another student cannot read the result', async () => {
    const owner = await makeStudent();
    const intruder = await makeStudent();
    const test = await makeTest({ count: 2 });
    const { attempt } = await startAttempt({ user: owner, testId: String(test._id) });
    await finalizeAttempt({ attemptId: attempt._id, emit: false });

    const agent = await agentFor(intruder);
    const res = await agent.get(`/attempts/${attempt._id}/result`);
    expect(res.status).toBe(403);
  });

  test('an admin can read a student result', async () => {
    const student = await makeStudent();
    const admin = await makeAdmin();
    const test = await makeTest({ count: 2 });
    const { attempt } = await startAttempt({ user: student, testId: String(test._id) });
    await finalizeAttempt({ attemptId: attempt._id, emit: false });

    const agent = await agentFor(admin);
    const res = await agent.get(`/attempts/${attempt._id}/result`);
    expect(res.status).toBe(200);
  });
});

describe('auto-submit job', () => {
  test('finalizes an expired attempt that nobody submitted', async () => {
    const student = await makeStudent();
    const test = await makeTest({ count: 2, durationMinutes: 1 });
    const { attempt } = await startAttempt({ user: student, testId: String(test._id) });

    // Simulate the tab having been closed: push the deadline into the past.
    await Attempt.updateOne(
      { _id: attempt._id },
      { $set: { deadlineAt: new Date(Date.now() - 60_000) } }
    );

    const run = await runOnce();
    expect(run.finalized).toBe(1);

    const fresh = await Attempt.findById(attempt._id).lean();
    expect(fresh.status).toBe('submitted');
    expect(fresh.autoSubmitted).toBe(true);
    expect(fresh.submittedAt).toBeTruthy();
  });

  test('does not touch a live attempt', async () => {
    const student = await makeStudent();
    const test = await makeTest({ count: 2, durationMinutes: 60 });
    const { attempt } = await startAttempt({ user: student, testId: String(test._id) });

    await runOnce();

    const fresh = await Attempt.findById(attempt._id).lean();
    expect(fresh.status).toBe('in_progress');
  });

  test('never creates ghost attempts and leaves no in_progress past deadline', async () => {
    const student = await makeStudent();
    const test = await makeTest({ count: 2, durationMinutes: 1 });
    await startAttempt({ user: student, testId: String(test._id) });
    await Attempt.updateMany({}, { $set: { deadlineAt: new Date(Date.now() - 120_000) } });

    await runOnce();

    expect(await Attempt.countDocuments({ status: 'in_progress' })).toBe(0);
    expect(await Attempt.countDocuments({})).toBe(1);
  });
});

describe('tab-switch (proctor) logging', () => {
  test('each distinct switch increments tabSwitchCount and stores the timestamp', async () => {
    const student = await makeStudent();
    const test = await makeTest({ count: 2 });
    const { attempt } = await startAttempt({ user: student, testId: String(test._id) });
    const agent = await agentFor(student);

    await agent.post(`/attempts/${attempt._id}/events`).send({ type: 'tab_switch' });
    // A second switch is a new hidden->visible->hidden cycle, so it must be
    // spaced past the dedupe window or it is treated as the same switch.
    await new Promise((r) => setTimeout(r, 1100));
    const res = await agent.post(`/attempts/${attempt._id}/events`).send({ type: 'tab_switch' });

    expect(res.status).toBe(200);
    expect(res.body.data.tabSwitchCount).toBe(2);

    const fresh = await Attempt.findById(attempt._id).lean();
    expect(fresh.events).toHaveLength(2);
    expect(fresh.events[0].type).toBe('tab_switch');
    expect(fresh.events[0].at).toBeTruthy();
  });

  test('rejects an unknown event type', async () => {
    const student = await makeStudent();
    const test = await makeTest({ count: 2 });
    const { attempt } = await startAttempt({ user: student, testId: String(test._id) });
    const agent = await agentFor(student);

    const res = await agent.post(`/attempts/${attempt._id}/events`).send({ type: 'camera_picture' });
    expect(res.status).toBe(400);
  });
});

describe('tab-switch auto-submit limit', () => {
  const fire = (agent, attemptId) =>
    agent.post(`/attempts/${attemptId}/events`).send({ type: 'tab_switch' });

  test('below the limit only warns', async () => {
    const student = await makeStudent();
    const test = await makeTest({ count: 2, maxTabSwitches: 3 });
    const { attempt } = await startAttempt({ user: student, testId: String(test._id) });
    const agent = await agentFor(student);

    const res = await fire(agent, attempt._id);

    expect(res.status).toBe(200);
    expect(res.body.data.tabSwitchCount).toBe(1);
    expect(res.body.data.autoSubmitted).toBe(false);

    const stored = await Attempt.findById(attempt._id).lean();
    expect(stored.status).toBe('in_progress');
    expect(stored.autoSubmitted).toBe(false);
  });

  test('reaching the limit finalizes the attempt once with the reason', async () => {
    const student = await makeStudent();
    const test = await makeTest({ count: 2, maxTabSwitches: 2 });
    const { attempt } = await startAttempt({ user: student, testId: String(test._id) });
    const agent = await agentFor(student);

    await fire(agent, attempt._id);
    // Distinct switch: must clear the dedupe window before the second event.
    await new Promise((r) => setTimeout(r, 1100));
    const res = await fire(agent, attempt._id);

    expect(res.status).toBe(200);
    expect(res.body.data.tabSwitchCount).toBe(2);
    expect(res.body.data.autoSubmitted).toBe(true);

    const stored = await Attempt.findById(attempt._id).lean();
    expect(stored.status).toBe('submitted');
    expect(stored.autoSubmitted).toBe(true);
    expect(stored.autoSubmitReason).toBe('tab_switch_limit');
    expect(stored.events).toHaveLength(2);
  });

  test('a further event after finalize changes nothing', async () => {
    const student = await makeStudent();
    const test = await makeTest({ count: 2, maxTabSwitches: 1 });
    const { attempt } = await startAttempt({ user: student, testId: String(test._id) });
    const agent = await agentFor(student);

    await fire(agent, attempt._id);
    const res = await fire(agent, attempt._id);

    expect(res.status).toBe(409);

    const stored = await Attempt.findById(attempt._id).lean();
    expect(stored.status).toBe('submitted');
    expect(stored.autoSubmitReason).toBe('tab_switch_limit');
    expect(stored.events).toHaveLength(1);
    expect(stored.tabSwitchCount).toBe(1);
  });

  test('duplicate events within a second count once', async () => {
    const student = await makeStudent();
    const test = await makeTest({ count: 2, maxTabSwitches: 3 });
    const { attempt } = await startAttempt({ user: student, testId: String(test._id) });
    const agent = await agentFor(student);

    await fire(agent, attempt._id);
    const res = await fire(agent, attempt._id);

    expect(res.status).toBe(200);
    expect(res.body.data.tabSwitchCount).toBe(1);
    expect(res.body.data.autoSubmitted).toBe(false);

    const stored = await Attempt.findById(attempt._id).lean();
    expect(stored.tabSwitchCount).toBe(1);
    expect(stored.events).toHaveLength(1);
  });

  test('limit 0 never auto-submits', async () => {
    const student = await makeStudent();
    const test = await makeTest({ count: 2, maxTabSwitches: 0 });
    const { attempt } = await startAttempt({ user: student, testId: String(test._id) });
    const agent = await agentFor(student);

    await fire(agent, attempt._id);
    await fire(agent, attempt._id);
    const res = await fire(agent, attempt._id);

    expect(res.status).toBe(200);
    expect(res.body.data.autoSubmitted).toBe(false);

    const stored = await Attempt.findById(attempt._id).lean();
    expect(stored.status).toBe('in_progress');
    expect(stored.autoSubmitReason).toBeNull();
  });

  test("another student's attempt returns 403", async () => {
    const student = await makeStudent();
    const test = await makeTest({ count: 2 });
    const { attempt } = await startAttempt({ user: student, testId: String(test._id) });

    const outsider = await makeStudent();
    const agent = await agentFor(outsider);
    const res = await fire(agent, attempt._id);

    expect(res.status).toBe(403);
  });
});

describe('attempt limit per test', () => {
  const login = async (student) => {
    const agent = request.agent(app);
    await agent.post('/auth/login').send({ identifier: student.username, password: 'Student@123' });
    return agent;
  };

  const submitOnce = async (student, test) => {
    const agent = await login(student);
    const started = await agent.post(`/tests/${test._id}/start`);
    for (const q of started.body.data.questions) {
      await agent
        .patch(`/attempts/${started.body.data.id}/answers`)
        .send({ questionId: String(q._id), selectedIndex: 0 });
    }
    await agent.post(`/attempts/${started.body.data.id}/submit`).send({});
    return { agent, attemptId: started.body.data.id };
  };

  test('maxAttempts 0 means unlimited', async () => {
    const student = await makeStudent();
    const test = await makeTest({ count: 2, maxAttempts: 0 });
    await submitOnce(student, test);
    const agent = await login(student);
    const res = await agent.post(`/tests/${test._id}/start`);
    expect(res.status).toBe(200);
  });

  test('a second start is refused once the cap is reached', async () => {
    const student = await makeStudent();
    const test = await makeTest({ count: 2, maxAttempts: 1 });
    const { agent } = await submitOnce(student, test);
    const res = await agent.post(`/tests/${test._id}/start`);
    expect(res.status).toBe(403);
    expect(res.body.message).toBe('You Already attempted this test before.');
  });

  test('a live attempt resumes even when the cap is reached', async () => {
    const student = await makeStudent();
    const test = await makeTest({ count: 2, maxAttempts: 1 });
    const agent = await login(student);
    const first = await agent.post(`/tests/${test._id}/start`).send({});
    // No submit: a second start must resume the same in-progress attempt.
    const again = await agent.post(`/tests/${test._id}/start`).send({});
    expect(again.status).toBe(200);
    expect(again.body.data.id).toBe(first.body.data.id);
  });

  test('an admin grant lets the student attempt again', async () => {
    const student = await makeStudent();
    const test = await makeTest({ count: 2, maxAttempts: 1 });
    const { agent } = await submitOnce(student, test);

    expect((await agent.post(`/tests/${test._id}/start`)).status).toBe(403);

    const adminAgent = await login(await makeAdmin());
    const grant = await adminAgent
      .post(`/admin/tests/${test._id}/extra-attempt`)
      .send({ userId: String(student._id) });
    expect(grant.status).toBe(200);
    expect(grant.body.data.extraAttempts).toBe(1);

    expect((await agent.post(`/tests/${test._id}/start`)).status).toBe(200);
  });

  test('a grant is scoped to the student it was given to', async () => {
    const allowed = await makeStudent();
    const blocked = await makeStudent();
    const test = await makeTest({ count: 2, maxAttempts: 1 });
    await submitOnce(allowed, test);
    await submitOnce(blocked, test);

    const adminAgent = await login(await makeAdmin());
    await adminAgent.post(`/admin/tests/${test._id}/extra-attempt`).send({ userId: String(allowed._id) });

    const blockedAgent = await login(blocked);
    const res = await blockedAgent.post(`/tests/${test._id}/start`);
    expect(res.status).toBe(403);
  });

  test('the student list reports attempts used and no attempts left', async () => {
    const student = await makeStudent();
    const test = await makeTest({ count: 2, maxAttempts: 1 });
    const { agent } = await submitOnce(student, test);

    const list = await agent.get('/tests?page=1&limit=20');
    const item = list.body.data.items.find((i) => i.id === String(test._id));
    expect(item.maxAttempts).toBe(1);
    expect(item.attemptsUsed).toBe(1);
    expect(item.attemptsAllowed).toBe(1);
    expect(item.noAttemptsLeft).toBe(true);
  });

  test('a student cannot call the extra-attempt admin route', async () => {
    const student = await makeStudent();
    const test = await makeTest({ count: 2, maxAttempts: 1 });
    const { agent } = await submitOnce(student, test);
    const res = await agent.post(`/admin/tests/${test._id}/extra-attempt`).send({ userId: String(student._id) });
    expect(res.status).toBe(403);
  });
});

describe('GET /attempts/mine filters', () => {
  // Regression: the route validates `status` and `testId` but the controller
  // used to ignore both, so the filter silently returned every attempt.
  test('status narrows the list to submitted attempts only', async () => {
    const student = await makeStudent();
    const agent = await agentFor(student);
    const test = await makeTest({ count: 2 });

    const started = await agent.post(`/tests/${test._id}/start`).send({});
    const attemptId = started.body.data.id;

    const inProgress = await agent.get('/attempts/mine?page=1&limit=20');
    expect(inProgress.body.data.total).toBe(1);
    expect(inProgress.body.data.items[0].status).toBe('in_progress');

    for (const q of started.body.data.questions) {
      await agent
        .patch(`/attempts/${attemptId}/answers`)
        .send({ questionId: String(q._id), selectedIndex: 0 });
    }
    await agent.post(`/attempts/${attemptId}/submit`).send({});

    const all = await agent.get('/attempts/mine?page=1&limit=20');
    expect(all.body.data.total).toBe(1);

    const submitted = await agent.get('/attempts/mine?page=1&limit=20&status=submitted');
    expect(submitted.body.data.total).toBe(1);
    expect(submitted.body.data.items[0].status).toBe('submitted');

    const inProgressOnly = await agent.get('/attempts/mine?page=1&limit=20&status=in_progress');
    expect(inProgressOnly.body.data.total).toBe(0);

    const otherTest = await makeTest({ count: 2 });
    const byTest = await agent.get(`/attempts/mine?page=1&limit=20&testId=${otherTest._id}`);
    expect(byTest.body.data.total).toBe(0);
  });
});