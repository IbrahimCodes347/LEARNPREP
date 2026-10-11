import request from 'supertest';
import { createApp } from '../src/app.js';
import { Question } from '../src/models/Question.js';
import { Test } from '../src/models/Test.js';
import { User as UserModel } from '../src/models/User.js';
import { makeAdmin, makeQuestion, makeQuestions, makeStudent, makeTest } from './helpers.js';

const app = createApp();

async function adminAgent() {
  const admin = await makeAdmin();
  const agent = request.agent(app);
  await agent.post('/auth/login').send({ identifier: admin.username, password: 'Student@123' });
  return agent;
}

describe('test generator', () => {
  test('creates a test with a fixed pool and a summed totalMarks', async () => {
    const agent = await adminAgent();
    await makeQuestions(5, { subject: 'OS', marks: 2 });

    const res = await agent.post('/admin/tests/generate').send({
      title: 'OS Mock',
      subject: 'OS',
      count: 5,
      durationMinutes: 20
    });

    expect(res.status).toBe(201);
    expect(res.body.data.test.questionIds).toHaveLength(5);
    expect(res.body.data.test.totalMarks).toBe(10);
    expect(res.body.data.test.status).toBe('draft');
  });

  test('returns the exact product error when the bank is too small', async () => {
    const agent = await adminAgent();
    await makeQuestions(30, { subject: 'OS' });

    const res = await agent.post('/admin/tests/generate').send({
      title: 'Too Big',
      subject: 'OS',
      count: 50,
      durationMinutes: 20
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Not enough questions available. Requested 50, found 30.');
  });

  test('soft-deleted questions do not count towards availability', async () => {
    const agent = await adminAgent();
    const questions = await makeQuestions(5, { subject: 'OS' });
    await Question.updateMany({ _id: { $in: questions.slice(0, 3).map((q) => q._id) } }, { isDeleted: true });

    const res = await agent.post('/admin/tests/generate').send({
      title: 'OS Mock',
      subject: 'OS',
      count: 4,
      durationMinutes: 20
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Not enough questions available. Requested 4, found 2.');
  });

  test('topic and difficulty filters narrow the pool', async () => {
    const agent = await adminAgent();
    await makeQuestions(4, { subject: 'OS', topic: 'Memory', difficulty: 'easy' });
    await makeQuestions(3, { subject: 'OS', topic: 'Deadlock', difficulty: 'hard' });

    const res = await agent.post('/admin/tests/generate').send({
      title: 'Filtered',
      subject: 'OS',
      topics: ['Deadlock'],
      difficulties: ['hard'],
      count: 3,
      durationMinutes: 10
    });

    expect(res.status).toBe(201);
    expect(res.body.data.test.questionIds).toHaveLength(3);

    const tooMany = await agent.post('/admin/tests/generate').send({
      title: 'Filtered 2',
      subject: 'OS',
      topics: ['Deadlock'],
      count: 4,
      durationMinutes: 10
    });
    expect(tooMany.body.message).toBe('Not enough questions available. Requested 4, found 3.');
  });

  test('validates the generator payload', async () => {
    const agent = await adminAgent();
    const res = await agent.post('/admin/tests/generate').send({
      title: 'x',
      subject: 'OS',
      count: 0
    });
    expect(res.status).toBe(400);
  });
});

describe('test generator: case-insensitive filters and bank breakdown', () => {
  test('a lowercase subject filter still finds the questions', async () => {
    const agent = await adminAgent();
    await makeQuestions(5, { subject: 'Data Structures', topic: 'Trees', difficulty: 'easy' });

    const res = await agent.post('/admin/tests/generate').send({
      title: 'Lowercase',
      subject: 'data structures',
      count: 3,
      durationMinutes: 10
    });

    expect(res.status).toBe(201);
    expect(res.body.data.test.questionIds).toHaveLength(3);
  });

  test('mixed-case topic and difficulty still match', async () => {
    const agent = await adminAgent();
    await makeQuestions(2, { subject: 'Data Structures', topic: 'Trees', difficulty: 'easy' });
    await makeQuestions(3, { subject: 'Data Structures', topic: 'Graphs', difficulty: 'hard' });

    const res = await agent.post('/admin/tests/generate').send({
      title: 'Mixed',
      subject: 'DATA STRUCTURES',
      topics: ['graphs'],
      difficulties: ['HARD'],
      count: 3,
      durationMinutes: 10
    });

    expect(res.status).toBe(201);
    expect(res.body.data.test.questionIds).toHaveLength(3);
  });

  test('a real shortage still returns the exact product error', async () => {
    const agent = await adminAgent();
    await makeQuestions(2, { subject: 'Data Structures' });

    const res = await agent.post('/admin/tests/generate').send({
      title: 'Short',
      subject: 'data structures',
      count: 5,
      durationMinutes: 10
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Not enough questions available. Requested 5, found 2.');
  });

  test('soft-deleted questions are never picked, even case-insensitively', async () => {
    const agent = await adminAgent();
    const questions = await makeQuestions(4, { subject: 'Data Structures' });
    await Question.updateMany({ _id: { $in: questions.slice(0, 3).map((q) => q._id) } }, { isDeleted: true });

    const res = await agent.post('/admin/tests/generate').send({
      title: 'Live only',
      subject: 'data structures',
      count: 2,
      durationMinutes: 10
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Not enough questions available. Requested 2, found 1.');
  });

  test('the bank breakdown returns subjects with topics and correct counts', async () => {
    const agent = await adminAgent();
    await makeQuestions(3, { subject: 'Data Structures', topic: 'Trees', difficulty: 'easy' });
    await makeQuestions(2, { subject: 'Data Structures', topic: 'Trees', difficulty: 'hard' });
    await makeQuestions(1, { subject: 'Data Structures', topic: 'Graphs', difficulty: 'medium' });
    await makeQuestions(4, { subject: 'Operating Systems', topic: 'Memory', difficulty: 'easy' });
    const hidden = await makeQuestions(5, { subject: 'Data Structures', topic: 'Trees', difficulty: 'easy' });
    await Question.updateMany({ _id: { $in: hidden.map((q) => q._id) } }, { isDeleted: true });

    const res = await agent.get('/admin/questions/bank');

    expect(res.status).toBe(200);
    const subjects = res.body.data.subjects;
    expect(subjects.map((s) => s.subject)).toEqual(['Data Structures', 'Operating Systems']);

    const ds = subjects.find((s) => s.subject === 'Data Structures');
    expect(ds.count).toBe(6);
    const trees = ds.topics.find((t) => t.topic === 'Trees');
    expect(trees.count).toBe(5);
    expect(trees.difficulties).toEqual({ easy: 3, medium: 0, hard: 2 });
    const graphs = ds.topics.find((t) => t.topic === 'Graphs');
    expect(graphs.count).toBe(1);
    expect(graphs.difficulties.medium).toBe(1);

    const os = subjects.find((s) => s.subject === 'Operating Systems');
    expect(os.count).toBe(4);
  });

  test('the bank breakdown is blocked for students (403)', async () => {
    const student = await makeStudent();
    const agent = request.agent(app);
    await agent.post('/auth/login').send({ identifier: student.username, password: 'Student@123' });

    const res = await agent.get('/admin/questions/bank');
    expect(res.status).toBe(403);
  });
});

describe('student test list', () => {
  test('shows only active tests inside the window', async () => {
    const student = await makeStudent();
    await makeTest({ title: 'Open now', status: 'active' });
    await makeTest({ title: 'Draft', status: 'draft' });
    await makeTest({
      title: 'Closed',
      status: 'active',
      activeFrom: new Date(Date.now() - 7200_000),
      activeUntil: new Date(Date.now() - 3600_000)
    });
    await makeTest({
      title: 'Future',
      status: 'active',
      activeFrom: new Date(Date.now() + 3600_000),
      activeUntil: new Date(Date.now() + 7200_000)
    });

    const agent = request.agent(app);
    await agent.post('/auth/login').send({ identifier: student.username, password: 'Student@123' });
    const res = await agent.get('/tests');

    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.items[0].title).toBe('Open now');
    expect(res.body.data.items[0].isOpen).toBe(true);
  });

  test('a test can be filtered by subject', async () => {
    const student = await makeStudent();
    await makeTest({ subject: 'Data Structures', status: 'active' });
    await makeTest({ subject: 'DBMS', status: 'active' });

    const agent = request.agent(app);
    await agent.post('/auth/login').send({ identifier: student.username, password: 'Student@123' });
    const res = await agent.get('/tests?subject=DBMS');

    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.items[0].subject).toBe('DBMS');
  });

  test('pagination limit is capped at 100', async () => {
    const student = await makeStudent();
    const agent = request.agent(app);
    await agent.post('/auth/login').send({ identifier: student.username, password: 'Student@123' });

    const res = await agent.get('/tests?limit=999');
    expect(res.status).toBe(400);
  });

  test('a test stays visible after it closes so the student can still open the result', async () => {
    const student = await makeStudent();
    const closedAt = new Date(Date.now() + 7200_000);
    const test = await makeTest({
      count: 2,
      activeFrom: new Date(Date.now() - 7200_000),
      activeUntil: new Date(Date.now() + 3600_000)
    });

    const agent = request.agent(app);
    await agent.post('/auth/login').send({ identifier: student.username, password: 'Student@123' });

    const start = await agent.post(`/tests/${test._id}/start`);
    expect(start.status).toBe(200);
    await agent.post(`/attempts/${start.body.data.id}/submit`);

    await Test.updateOne({ _id: test._id }, { $set: { activeUntil: closedAt } });

    const list = await agent.get('/tests');
    expect(list.body.data.items.map((t) => t.title)).toContain('Test');
  });
});

describe('leaderboard', () => {
  test('lists the best attempt per student, ranked', async () => {
    const agent = await adminAgent();
    const a = await makeStudent();
    const b = await makeStudent();
    const test = await makeTest({ count: 2, totalMarks: 2, shuffle: false });

    for (const [user, picks] of [
      [a, [0, 0]],
      [b, [0, 1]]
    ]) {
      const sAgent = request.agent(app);
      await sAgent.post('/auth/login').send({ identifier: user.username, password: 'Student@123' });
      const start = await sAgent.post(`/tests/${test._id}/start`);
      const questions = start.body.data.questions;

      for (let i = 0; i < picks.length; i += 1) {
        const question = questions[i];
        const answer = await Question.findById(question._id).lean();
        await sAgent.patch(`/attempts/${start.body.data.id}/answers`).send({
          questionId: question._id,
          selectedIndex: picks[i],
          timeSpentSec: 5
        });
        expect(answer).toBeTruthy();
      }
      await sAgent.post(`/attempts/${start.body.data.id}/submit`);
    }

    const res = await agent.get(`/tests/${test._id}/leaderboard`);
    expect(res.status).toBe(200);
    expect(res.body.data.entries).toHaveLength(2);
    expect(res.body.data.entries[0].rank).toBe(1);
    expect(res.body.data.entries[0].userId).toBe(String(a._id));
    expect(res.body.data.entries[1].percentage).toBe(50);
  });

  test('an invalid test id gives 400 not 500', async () => {
    const student = await makeStudent();
    const agent = request.agent(app);
    await agent.post('/auth/login').send({ identifier: student.username, password: 'Student@123' });
    const res = await agent.get('/tests/nope/leaderboard');
    expect(res.status).toBe(400);
  });

  test('an unknown but valid id gives 404', async () => {
    const student = await makeStudent();
    const agent = request.agent(app);
    await agent.post('/auth/login').send({ identifier: student.username, password: 'Student@123' });
    const res = await agent.get('/tests/0123456789abcdef01234567/leaderboard');
    expect(res.status).toBe(404);
  });
});

describe('student management (admin)', () => {
  test('creates, searches, deactivates and prevents starting a test', async () => {
    const agent = await adminAgent();

    const created = await agent.post('/admin/students').send({
      name: 'New Student',
      username: 'newstudent',
      password: 'Student@123',
      grade: 'TYCS Sem V'
    });
    expect(created.status).toBe(201);

    const search = await agent.get('/admin/students?search=newstu');
    expect(search.body.data.items).toHaveLength(1);

    const deactivated = await agent.patch(`/admin/students/${created.body.data.student._id}`).send({
      isActive: false
    });
    expect(deactivated.status).toBe(200);

    // Deactivated student can no longer log in.
    const login = await request(app)
      .post('/auth/login')
      .send({ identifier: 'newstudent', password: 'Student@123' });
    expect(login.status).toBe(401);

    // And cannot start a test even with an existing session.
    const test = await makeTest({ count: 2 });
    const stillActive = await agent.patch(`/admin/students/${created.body.data.student._id}`).send({
      isActive: true
    });
    expect(stillActive.status).toBe(200);

    const sAgent = request.agent(app);
    await sAgent.post('/auth/login').send({ identifier: 'newstudent', password: 'Student@123' });
    await agent.patch(`/admin/students/${created.body.data.student._id}`).send({ isActive: false });

    const start = await sAgent.post(`/tests/${test._id}/start`);
    expect(start.status).toBe(403);
  });

  test('rejects a duplicate username with 409', async () => {
    const agent = await adminAgent();
    await makeStudent({ username: 'dupe' });

    const res = await agent.post('/admin/students').send({
      name: 'Dupe',
      username: 'dupe',
      password: 'Student@123'
    });
    expect(res.status).toBe(409);
  });

  test('rejects a weak password', async () => {
    const agent = await adminAgent();
    const res = await agent.post('/admin/students').send({
      name: 'Weak',
      username: 'weakpass',
      password: '123'
    });
    expect(res.status).toBe(400);
  });

  test('student cannot set a role', async () => {
    const agent = await adminAgent();
    const res = await agent.post('/admin/students').send({
      name: 'Sneaky',
      username: 'sneaky',
      password: 'Student@123',
      role: 'admin'
    });
    expect(res.status).toBe(400);
  });
});

describe('admin edit and delete student', () => {
  const makeStudentViaAdmin = async (agent, overrides = {}) => {
    const res = await agent.post('/admin/students').send({
      name: 'Edit Me',
      username: 'editme',
      password: 'Student@123',
      ...overrides
    });
    return res.body.data.student;
  };

  test('edits a student and lets them log in with the new password', async () => {
    const agent = await adminAgent();
    const student = await makeStudentViaAdmin(agent);

    const res = await agent.patch(`/admin/students/${student._id}`).send({
      name: 'Edited Name',
      grade: 'SYCS Sem III',
      password: 'NewPass@123'
    });

    expect(res.status).toBe(200);
    expect(res.body.data.student.name).toBe('Edited Name');
    expect(res.body.data.student.grade).toBe('SYCS Sem III');

    const fresh = await request(app)
      .post('/auth/login')
      .send({ identifier: 'editme', password: 'NewPass@123' });
    expect(fresh.status).toBe(200);
  });

  test('a duplicate username on edit is rejected with the field named', async () => {
    const agent = await adminAgent();
    await makeStudent({ username: 'taken' });
    const student = await makeStudentViaAdmin(agent);

    const res = await agent.patch(`/admin/students/${student._id}`).send({ username: 'taken' });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/username/i);
  });

  test('a role change on edit is rejected', async () => {
    const agent = await adminAgent();
    const student = await makeStudentViaAdmin(agent);

    const res = await agent.patch(`/admin/students/${student._id}`).send({ role: 'admin' });

    expect(res.status).toBe(400);
  });

  test('delete hides the student from the list and blocks login', async () => {
    const agent = await adminAgent();
    const student = await makeStudentViaAdmin(agent);

    const del = await agent.delete(`/admin/students/${student._id}`);
    expect(del.status).toBe(200);

    const list = await agent.get('/admin/students?search=editme');
    expect(list.body.data.items).toHaveLength(0);

    const login = await request(app)
      .post('/auth/login')
      .send({ identifier: 'editme', password: 'Student@123' });
    expect(login.status).toBe(401);
  });

  test('a deleted student loses their open session on the next request', async () => {
    const agent = await adminAgent();
    const student = await makeStudentViaAdmin(agent);

    const sAgent = request.agent(app);
    await sAgent.post('/auth/login').send({ identifier: 'editme', password: 'Student@123' });
    expect((await sAgent.get('/auth/me')).status).toBe(200);

    await agent.delete(`/admin/students/${student._id}`);

    expect((await sAgent.get('/auth/me')).status).toBe(401);
  });

  test('attempts of a deleted student still appear in analytics', async () => {
    const agent = await adminAgent();
    const student = await makeStudent({ username: 'ghost' });
    const test = await makeTest({ count: 1 });

    const sAgent = request.agent(app);
    await sAgent.post('/auth/login').send({ identifier: 'ghost', password: 'Student@123' });
    const start = await sAgent.post(`/tests/${test._id}/start`).send({});
    await sAgent
      .patch(`/attempts/${start.body.data.id}/answers`)
      .send({ questionId: String(test.questionIds[0]), selectedIndex: 0 });
    await sAgent.post(`/attempts/${start.body.data.id}/submit`).send({});

    await agent.delete(`/admin/students/${student._id}`);

    const stats = await agent.get('/admin/analytics/classes');
    expect(stats.status).toBe(200);
    const total = stats.body.data.classes.reduce((sum, c) => sum + c.attempts, 0);
    expect(total).toBeGreaterThanOrEqual(1);
  });

  test('an admin cannot delete their own account', async () => {
    const admin = await makeAdmin();
    const agent = request.agent(app);
    await agent.post('/auth/login').send({ identifier: admin.username, password: 'Student@123' });

    const res = await agent.delete(`/admin/students/${admin._id}`);
    expect(res.status).toBe(403);
  });

  test('a student calling the admin routes gets 403', async () => {
    const student = await makeStudent({ username: 'nosy' });
    const agent = request.agent(app);
    await agent.post('/auth/login').send({ identifier: 'nosy', password: 'Student@123' });

    const list = await agent.get('/admin/students');
    const del = await agent.delete(`/admin/students/${student._id}`);
    expect(list.status).toBe(403);
    expect(del.status).toBe(403);
  });
});

describe('CSV bulk import', () => {
  test('imports good rows and reports bad rows without blocking the rest', async () => {
    const agent = await adminAgent();

    const csv = [
      'name,username,email,rollno,password,grade',
      'Good One,goodone,good1@example.com,IMP-1,Student@123,TYCS Sem V',
      'Bad Row,,,,,',
      'Good Two,goodtwo,good2@example.com,IMP-2,Student@123,TYCS Sem V',
      'Bad Password,badpass,bad@example.com,IMP-3,123,TYCS Sem V'
    ].join('\n');

    const res = await agent.post('/admin/students/bulk').attach('file', Buffer.from(csv), {
      filename: 'students.csv',
      contentType: 'text/csv'
    });

    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(4);
    expect(res.body.data.createdCount).toBe(2);
    expect(res.body.data.errorCount).toBe(2);
    expect(res.body.data.errors[0].row).toBe(3);
    expect(res.body.data.errors[1].row).toBe(5);
  });

  test('imported rows can never become admins', async () => {
    const agent = await adminAgent();
    const csv = [
      'name,username,email,rollno,password,grade,role',
      'Sneaky,sneakyimport,s@example.com,IMP-9,Student@123,TYCS Sem V,admin'
    ].join('\n');

    await agent.post('/admin/students/bulk').attach('file', Buffer.from(csv), {
      filename: 'students.csv',
      contentType: 'text/csv'
    });

    const { User } = await import('../src/models/User.js');
    const user = await User.findOne({ username: 'sneakyimport' }).lean();
    expect(user.role).toBe('student');
  });

  test('rejects a non csv/json file', async () => {
    const agent = await adminAgent();
    const res = await agent.post('/admin/students/bulk').attach('file', Buffer.from('nope'), {
      filename: 'evil.exe',
      contentType: 'application/octet-stream'
    });
    expect(res.status).toBe(400);
  });

  test('imports questions from JSON and skips malformed rows', async () => {
    const agent = await adminAgent();
    const json = JSON.stringify([
      {
        subject: 'DS',
        topic: 'Trees',
        difficulty: 'easy',
        questionText: 'Valid question here?',
        options: ['A', 'B'],
        correctIndex: 0
      },
      { subject: 'DS', topic: 'Trees', difficulty: 'nope', questionText: 'Bad', options: ['A'], correctIndex: 0 }
    ]);

    const res = await agent.post('/admin/questions/bulk').attach('file', Buffer.from(json), {
      filename: 'questions.json',
      contentType: 'application/json'
    });

    expect(res.status).toBe(200);
    expect(res.body.data.createdCount).toBe(1);
    expect(res.body.data.errorCount).toBe(1);
  });

  test('imports questions from CSV, keeps an empty explanation and reports real row errors', async () => {
    const agent = await adminAgent();

    const csv = [
      'subject,topic,difficulty,questionText,options,correctIndex,marks,explanation',
      'ImportCSV,Trees,easy,Question one?,A|B|C,1,1,Because B',
      'ImportCSV,Trees,medium,Question two?,A|B|C,1,1,',
      'ImportCSV,Trees,hard,Question three?,A|B|C,2,1,Because C',
      'ImportCSV,Trees,easy,Question four?,A|B,5,1,Out of range',
      ',Trees,easy,Question five?,A|B,0,1,No subject'
    ].join('\n');

    const res = await agent.post('/admin/questions/bulk').attach('file', Buffer.from(csv), {
      filename: 'questions.csv',
      contentType: 'text/csv'
    });

    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(5);
    expect(res.body.data.createdCount).toBe(3);
    expect(res.body.data.errorCount).toBe(2);

    expect(res.body.data.errors.map((e) => e.row)).toEqual([5, 6]);
    const messages = res.body.data.errors.map((e) => e.message.toLowerCase());
    expect(messages.some((m) => m.includes('correctindex'))).toBe(true);
    expect(messages.some((m) => m.includes('subject'))).toBe(true);

    const saved = await Question.find({ subject: 'ImportCSV' }).lean();
    expect(saved).toHaveLength(3);
    expect(saved.some((q) => q.explanation === '')).toBe(true);
  });
});

describe('question bank', () => {
  test('soft delete hides the question, restore brings it back', async () => {
    const agent = await adminAgent();
    const question = await makeQuestion();

    const del = await agent.delete(`/admin/questions/${question._id}`);
    expect(del.status).toBe(200);
    expect(del.body.data.question.isDeleted).toBe(true);

    const listHidden = await agent.get('/admin/questions');
    expect(listHidden.body.data.items).toHaveLength(0);

    const restore = await agent.post(`/admin/questions/${question._id}/restore`);
    expect(restore.body.data.question.isDeleted).toBe(false);

    const listVisible = await agent.get('/admin/questions');
    expect(listVisible.body.data.items).toHaveLength(1);
  });

  test('rejects correctIndex outside the option range', async () => {
    const agent = await adminAgent();
    const res = await agent.post('/admin/questions').send({
      subject: 'DS',
      topic: 'Trees',
      questionText: 'Bad index?',
      options: ['A', 'B'],
      correctIndex: 5
    });
    expect(res.status).toBe(400);
  });
});

describe('bookmarks', () => {
  test('a student cannot bookmark a question they have not been tested on', async () => {
    const student = await makeStudent();
    const question = await makeQuestion();

    const agent = request.agent(app);
    await agent.post('/auth/login').send({ identifier: student.username, password: 'Student@123' });

    const res = await agent.post('/bookmarks').send({ questionId: String(question._id) });
    expect(res.status).toBe(403);
  });

  test('a student can bookmark a question from a submitted test and read the answer key', async () => {
    const student = await makeStudent();
    const question = await makeQuestion();
    const test = await makeTest({ questionIds: [question._id], totalMarks: 1 });

    const agent = request.agent(app);
    await agent.post('/auth/login').send({ identifier: student.username, password: 'Student@123' });
    const start = await agent.post(`/tests/${test._id}/start`);
    await agent.post(`/attempts/${start.body.data.id}/submit`);

    const added = await agent.post('/bookmarks').send({
      questionId: String(question._id),
      note: 'Revise this'
    });
    expect(added.status).toBe(200);

    const list = await agent.get('/bookmarks');
    expect(list.body.data.items).toHaveLength(1);
    expect(list.body.data.items[0].question.correctIndex).toBe(question.correctIndex);
    expect(list.body.data.items[0].note).toBe('Revise this');
  });

  test('bookmarks are scoped to the owner', async () => {
    const a = await makeStudent();
    const b = await makeStudent();
    const question = await makeQuestion();
    const test = await makeTest({ questionIds: [question._id], totalMarks: 1 });

    const agentA = request.agent(app);
    await agentA.post('/auth/login').send({ identifier: a.username, password: 'Student@123' });
    const start = await agentA.post(`/tests/${test._id}/start`);
    await agentA.post(`/attempts/${start.body.data.id}/submit`);
    await agentA.post('/bookmarks').send({ questionId: String(question._id) });

    const agentB = request.agent(app);
    await agentB.post('/auth/login').send({ identifier: b.username, password: 'Student@123' });
    const listB = await agentB.get('/bookmarks');
    expect(listB.body.data.items).toHaveLength(0);
  });
});

describe('validation hardening', () => {
  test('a NoSQL injection attempt in the identifier is treated as a string', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ identifier: { $ne: null }, password: { $ne: null } });

    expect(res.status).toBe(400);
  });

  test('an invalid ObjectId param returns 400 instead of a CastError', async () => {
    const agent = await adminAgent();
    const res = await agent.patch('/admin/students/not-an-id').send({ name: 'Valid Name' });
    expect(res.status).toBe(400);
  });

  test('a well-formed but unknown id returns 404', async () => {
    const agent = await adminAgent();
    const res = await agent
      .patch('/admin/students/0123456789abcdef01234567')
      .send({ name: 'Valid Name' });
    expect(res.status).toBe(404);
  });

  test('unknown body fields are rejected on write routes', async () => {
    const agent = await adminAgent();
    const res = await agent.post('/admin/questions').send({
      subject: 'DS',
      topic: 'Trees',
      questionText: 'Something',
      options: ['A', 'B'],
      correctIndex: 0,
      sneaky: 'value'
    });
    expect(res.status).toBe(400);
  });

  test('an empty body does not crash the server', async () => {
    const agent = await adminAgent();
    const res = await agent.post('/admin/students').send({});
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);

    const root = await request(app).get('/');
    expect(root.status).toBe(200);
  });
});
describe('student progress aggregation', () => {
  // Regression: the route hands `req.params.id` (a string) to the service.
  // `Attempt.find()` casts it, but `aggregate()` does not, so the summary and
  // trend used to come back empty while the attempts list was populated.
  test('summary and trend match the attempts list when the id arrives as a string', async () => {
    const agent = await adminAgent();
    const student = await makeStudent();
    const test = await makeTest({ count: 2, passMarks: 1 });

    // The test must be taken by the student whose progress we then read.
    const studentAgent = request.agent(app);
    await studentAgent
      .post('/auth/login')
      .send({ identifier: student.username, password: 'Student@123' });

    const start = await studentAgent.post(`/tests/${test._id}/start`).send({});
    const attemptId = start.body.data.id;
    const questionIds = start.body.data.questions.map((q) => String(q._id));

    for (const qid of questionIds) {
      await studentAgent.patch(`/attempts/${attemptId}/answers`).send({ questionId: qid, selectedIndex: 0 });
    }
    await studentAgent.post(`/attempts/${attemptId}/submit`).send({});

    const res = await agent.get(`/admin/students/${student._id}/progress`);

    expect(res.status).toBe(200);
    expect(res.body.data.attempts).toHaveLength(1);
    expect(res.body.data.summary.tests).toBe(1);
    expect(res.body.data.summary.avgPercentage).toBe(100);
    expect(res.body.data.trend).toHaveLength(1);
    expect(res.body.data.trend[0].percentage).toBe(100);
  });

  test('topic accuracy is returned weakest first', async () => {
    const agent = await adminAgent();
    const student = await makeStudent();
    const weak = await makeQuestion({ topic: 'Trees', questionText: 'weak' });
    const strong = await makeQuestion({ topic: 'Graphs', questionText: 'strong' });
    const test = await makeTest({ questionIds: [weak._id, strong._id] });

    const studentAgent = request.agent(app);
    await studentAgent
      .post('/auth/login')
      .send({ identifier: student.username, password: 'Student@123' });

    const start = await studentAgent.post(`/tests/${test._id}/start`).send({});
    const attemptId = start.body.data.id;
    // Trees answered wrong, Graphs answered right.
    await studentAgent
      .patch(`/attempts/${attemptId}/answers`)
      .send({ questionId: String(weak._id), selectedIndex: 1 });
    await studentAgent
      .patch(`/attempts/${attemptId}/answers`)
      .send({ questionId: String(strong._id), selectedIndex: 0 });
    await studentAgent.post(`/attempts/${attemptId}/submit`).send({});

    const res = await agent.get(`/admin/students/${student._id}/progress`);

    expect(res.status).toBe(200);
    expect(res.body.data.topicAccuracy).toEqual([
      { topic: 'Trees', total: 1, correct: 0, accuracy: 0 },
      { topic: 'Graphs', total: 1, correct: 1, accuracy: 100 }
    ]);
  });
});
describe('blank optional identifiers', () => {
  // Regression: username/email/rollno are unique+sparse. Persisting a blank one
  // as null put a real entry in the index, so the second student created without
  // an email failed with E11000 -> 409. Blank values must be absent, not null.
  test('two students with no email are both created (no 409 on the second)', async () => {
    const agent = await adminAgent();

    const first = await agent.post('/admin/students').send({
      name: 'No Email One',
      username: 'noemailone',
      password: 'Student@123',
      grade: 'TYCS Sem V'
    });
    const second = await agent.post('/admin/students').send({
      name: 'No Email Two',
      username: 'noemailtwo',
      password: 'Student@123',
      grade: 'TYCS Sem V'
    });

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);

    const { User } = await import('../src/models/User.js');
    const docs = await User.find({ username: { $in: ['noemailone', 'noemailtwo'] } }).lean();
    expect(docs).toHaveLength(2);
    for (const doc of docs) {
      // Absent from the document - not null, not ''.
      expect(Object.prototype.hasOwnProperty.call(doc, 'email')).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(doc, 'rollno')).toBe(false);
    }
  });

  test('whitespace-only and empty-string identifiers are dropped, not stored', async () => {
    const agent = await adminAgent();
    const res = await agent.post('/admin/students').send({
      name: 'Blank Fields',
      username: 'blankfields',
      email: '   ',
      rollno: '',
      password: 'Student@123'
    });

    expect(res.status).toBe(201);

    const { User } = await import('../src/models/User.js');
    const doc = await User.findOne({ username: 'blankfields' }).lean();
    expect(doc).not.toBeNull();
    expect(Object.prototype.hasOwnProperty.call(doc, 'email')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(doc, 'rollno')).toBe(false);
  });

  test('bulk CSV rows with a blank email all import successfully', async () => {
    const agent = await adminAgent();
    const csv = [
      'name,username,email,rollno,password,grade',
      'Blank Mail A,blankmaila,,,Student@123,TYCS Sem V',
      'Blank Mail B,blankmailb,,,Student@123,TYCS Sem V',
      'Blank Mail C,blankmailc,   ,   ,Student@123,TYCS Sem V'
    ].join('\n');

    const res = await agent
      .post('/admin/students/bulk')
      .attach('file', Buffer.from(csv), { filename: 'students.csv', contentType: 'text/csv' });

    expect(res.status).toBe(200);
    expect(res.body.data.createdCount).toBe(3);
    expect(res.body.data.errorCount).toBe(0);

    const { User } = await import('../src/models/User.js');
    const docs = await User.find({ username: { $in: ['blankmaila', 'blankmailb', 'blankmailc'] } }).lean();
    expect(docs).toHaveLength(3);
    for (const doc of docs) {
      expect(Object.prototype.hasOwnProperty.call(doc, 'email')).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(doc, 'rollno')).toBe(false);
    }
  });
});
describe('model-level blank identifier normalisation', () => {
  // The in-memory DB builds the indexes from the schema, so E11000 cannot be
  // reproduced here. Assert the guarantee instead: a blank identifier must be
  // ABSENT, because a stored null takes a slot in the live cluster's email_1.
  const savedRaw = async (overrides) => {
    const doc = new UserModel({ name: 'Raw Check', passwordHash: 'x', ...overrides });
    await doc.save();
    const raw = await UserModel.collection.findOne({ _id: doc._id });
    await doc.deleteOne();
    return raw;
  };

  test('a null email is absent from the stored document', async () => {
    const raw = await savedRaw({ email: null, username: 'rawnullmail' });
    expect(Object.prototype.hasOwnProperty.call(raw, 'email')).toBe(false);
  });

  test('an empty-string email is absent from the stored document', async () => {
    const raw = await savedRaw({ email: '', username: 'rawemptymail' });
    expect(Object.prototype.hasOwnProperty.call(raw, 'email')).toBe(false);
  });

  test('a whitespace-only rollno is absent from the stored document', async () => {
    const raw = await savedRaw({ rollno: '   ', username: 'rawblankroll' });
    expect(Object.prototype.hasOwnProperty.call(raw, 'rollno')).toBe(false);
  });

  test('a real value is still stored', async () => {
    const raw = await savedRaw({ email: 'keep@example.com', username: 'rawkeepmail' });
    expect(raw.email).toBe('keep@example.com');
  });

  test('clearing an email through the admin API removes the field', async () => {
    const agent = await adminAgent();
    const created = await agent.post('/admin/students').send({
      name: 'Clear Mail',
      username: 'clearmail',
      email: 'clear@example.com',
      password: 'Student@123'
    });
    const id = created.body.data.student.id;

    const patched = await agent.patch(`/admin/students/${id}`).send({ email: null });
    expect(patched.status).toBe(200);

    const raw = await UserModel.collection.findOne({ _id: new UserModel.base.Types.ObjectId(id) });
    expect(Object.prototype.hasOwnProperty.call(raw, 'email')).toBe(false);
  });
});

describe('identifier index definitions', () => {
  // A fresh database builds these from the schema on first server start, so the
  // definition itself has to exclude non-string values. `sparse` would still index
// an explicit null, which is what made the second blank-email write fail.
  beforeAll(async () => {
    await UserModel.init();
  });

  test.each(['username', 'email', 'rollno'])('%s_1 is unique with a string-only partial filter', async (field) => {
    const idx = await UserModel.collection.indexes();
    const found = idx.find((i) => i.name === `${field}_1`);
    expect(found).toBeDefined();
    expect(found.unique).toBe(true);
    expect(found.sparse).toBeFalsy();
    expect(found.partialFilterExpression).toEqual({ [field]: { $type: 'string' } });
  });
});
describe('aggregation ObjectId casting', () => {
  // aggregate() forwards pipeline values straight to the server: unlike find() it
  // never casts. A hex string in $match therefore matches *nothing* instead of
  // erroring, which showed up as silently empty tables.
  const submitAttempt = async (student, test, picks) => {
    const agent = request.agent(app);
    await agent.post('/auth/login').send({ identifier: student.username, password: 'Student@123' });
    const start = await agent.post(`/tests/${test._id}/start`);
    for (let i = 0; i < picks.length; i += 1) {
      await agent.patch(`/attempts/${start.body.data.id}/answers`).send({
        questionId: start.body.data.questions[i]._id,
        selectedIndex: picks[i],
        timeSpentSec: 5
      });
    }
    await agent.post(`/attempts/${start.body.data.id}/submit`);
  };

  test('analytics filtered by a hex-string testId returns rows', async () => {
    const student = await makeStudent();
    const test = await makeTest({ count: 2, totalMarks: 2, shuffle: false });
    await submitAttempt(student, test, [0, 1]);

    const agent = await adminAgent();
    const res = await agent.get(`/admin/analytics/questions?testId=${test._id}`);
    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(2);
    expect(res.body.data.items).toHaveLength(2);
  });

  test('a hex-string testId and an ObjectId testId give identical analytics', async () => {
    const student = await makeStudent();
    const test = await makeTest({ count: 2, totalMarks: 2, shuffle: false });
    await submitAttempt(student, test, [0, 1]);

    const { questionAnalytics } = await import('../src/services/analyticsService.js');
    const asString = await questionAnalytics({ testId: String(test._id), page: 1, limit: 20 });
    const asObjectId = await questionAnalytics({ testId: test._id, page: 1, limit: 20 });
    expect(asString.total).toBe(2);
    expect(asString).toEqual(asObjectId);
  });

  test('leaderboard matches a hex-string testId', async () => {
    const student = await makeStudent();
    const test = await makeTest({ count: 2, totalMarks: 2, shuffle: false });
    await submitAttempt(student, test, [0, 0]);

    const { getLeaderboard } = await import('../src/services/leaderboardService.js');
    const board = await getLeaderboard({ testId: String(test._id), viewerId: String(student._id) });
    expect(board.entries).toHaveLength(1);
    expect(board.entries[0].userId).toBe(String(student._id));
    expect(board.myRank).toBe(1);
  });

  test('adaptive subject average matches a hex-string userId', async () => {
    const student = await makeStudent();
    const test = await makeTest({ count: 2, totalMarks: 2, shuffle: false });
    await submitAttempt(student, test, [0, 0]);

    const { averagePercentInSubject } = await import('../src/services/adaptiveService.js');
    const asString = await averagePercentInSubject(String(student._id), test.subject);
    const asObjectId = await averagePercentInSubject(student._id, test.subject);
    expect(asString.attempts).toBe(1);
    expect(asString).toEqual(asObjectId);
  });

  test('an invalid id in a query string gives 400 not 500', async () => {
    const agent = await adminAgent();
    const res = await agent.get('/admin/analytics/questions?testId=not-an-id');
    expect(res.status).toBe(400);
  });

  test('the analytics table and the drill-down agree on attempted, correct and skipped', async () => {
    const { questionAnalytics, questionDetailStats } = await import(
      '../src/services/analyticsService.js'
    );

    const test = await makeTest({ count: 3, shuffle: false });
    const [q0, , q2] = test.questionIds.map(String);
    const a = await makeStudent();
    const b = await makeStudent();
    // correctIndex is 0 on every helper question: 0 is right, 1 is wrong.
    await submitAttempt(a, test, [0, 1]); // q0 right, q1 wrong, q2 skipped
    await submitAttempt(b, test, [1, 0]); // q0 wrong, q1 right, q2 skipped

    const { items } = await questionAnalytics({ testId: String(test._id), page: 1, limit: 20 });
    const rowFor = (id) => items.find((i) => i.questionId === id);

    const q0Row = rowFor(q0);
    expect(q0Row).toMatchObject({ total: 2, attempted: 2, correct: 1, wrong: 1, skipped: 0, accuracy: 50 });

    const q0Rows = await questionDetailStats(q0);
    expect(q0Rows).toHaveLength(q0Row.total);
    {
      const answered = q0Rows.filter((r) => r.selectedIndex !== null);
      const correct = answered.filter((r) => r.selectedIndex === 0);
      expect(answered).toHaveLength(q0Row.attempted);
      expect(correct).toHaveLength(q0Row.correct);
    }

    const q2Row = rowFor(q2);
    expect(q2Row).toMatchObject({ total: 2, attempted: 0, correct: 0, wrong: 0, skipped: 2, accuracy: 0 });
    const q2Rows = await questionDetailStats(q2);
    expect(q2Rows).toHaveLength(q2Row.total);
    expect(q2Rows.every((r) => r.selectedIndex === null)).toBe(true);
  });

  test('the drill-down lists each sitter by name, username and roll number', async () => {
    const student = await makeStudent({ name: 'Ada Lovelace', username: 'adal' });
    const test = await makeTest({ count: 1, shuffle: false });
    await submitAttempt(student, test, [0]);
    const questionId = String(test.questionIds[0]);

    const agent = await adminAgent();
    const res = await agent.get(`/admin/analytics/questions/${questionId}/attempts`);

    expect(res.status).toBe(200);
    expect(res.body.data.rows).toHaveLength(1);
    const row = res.body.data.rows[0];
    expect(row.name).toBe('Ada Lovelace');
    expect(row.username).toBe(student.username);
    expect(row.rollno).toBe(student.rollno);
    // Existing consumers still get the raw id; it is just no longer what the UI shows.
    expect(row).toHaveProperty('userId');
  });
});