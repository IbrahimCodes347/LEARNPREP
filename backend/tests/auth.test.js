import request from 'supertest';
import { createApp } from '../src/app.js';
import { User } from '../src/models/User.js';
import { makeAdmin, makeStudent } from './helpers.js';

const app = createApp();

const loginAs = (identifier, password = 'Student@123') =>
  request(app).post('/auth/login').send({ identifier, password });

describe('auth routes', () => {
  test('root endpoint responds without auth', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.text).toBe('LearnPrep API');
  });

  test('unknown route returns a JSON 404', async () => {
    const res = await request(app).get('/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  test('login with username sets an httpOnly cookie and returns the user without passwordHash', async () => {
    await makeStudent({ username: 'studentone', password: 'Student@123' });

    const res = await loginAs('studentone');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.username).toBe('studentone');
    expect(res.body.data.user.passwordHash).toBeUndefined();

    const cookies = res.headers['set-cookie'] ?? [];
    const cookie = cookies.find((c) => c.startsWith('lp_token='));
    expect(cookie).toBeDefined();
    expect(cookie).toMatch(/HttpOnly/i);
  });

  test('login also works with email and rollno', async () => {
    await makeStudent({ email: 'roll@example.com', rollno: 'TYCS-77', password: 'Student@123' });

    expect((await loginAs('roll@example.com')).status).toBe(200);
    expect((await loginAs('tycs-77')).status).toBe(200);
  });

  test('wrong password returns the generic 401', async () => {
    await makeStudent({ username: 'studenttwo' });
    const res = await request(app)
      .post('/auth/login')
      .send({ identifier: 'studenttwo', password: 'wrongpass' });

    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Invalid username or password');
  });

  test('every failure mode returns an identical 401 body (no user enumeration)', async () => {
    await makeStudent({ username: 'studentthree', isActive: false });

    const missing = await loginAs('ghostuser');
    const wrongPass = await loginAs('studentthree', 'nope-nope-nope');
    const deactivated = await loginAs('studentthree');

    expect(missing.status).toBe(401);
    expect(wrongPass.status).toBe(401);
    expect(deactivated.status).toBe(401);
    expect(missing.body.message).toBe(wrongPass.body.message);
    expect(wrongPass.body.message).toBe(deactivated.body.message);
    expect(missing.body.message).toBe('Invalid username or password');
  });

  test('login rejects unknown body fields (strict schema)', async () => {
    await makeStudent({ username: 'studentfour' });
    const res = await request(app)
      .post('/auth/login')
      .send({ identifier: 'studentfour', password: 'Student@123', isAdmin: true });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.errors[0].field).toBeDefined();
  });

  test('login validates the body and reports missing fields', async () => {
    const res = await request(app).post('/auth/login').send({});
    expect(res.status).toBe(400);
    expect(res.body.errors.map((e) => e.field)).toEqual(expect.arrayContaining(['identifier', 'password']));
  });

  test('/auth/me requires a session', async () => {
    const res = await request(app).get('/auth/me');
    expect(res.status).toBe(401);
  });

  test('/auth/me restores the session from the cookie', async () => {
    await makeStudent({ username: 'sessionuser' });
    const agent = request.agent(app);
    await agent.post('/auth/login').send({ identifier: 'sessionuser', password: 'Student@123' });

    const res = await agent.get('/auth/me');
    expect(res.status).toBe(200);
    expect(res.body.data.user.username).toBe('sessionuser');
  });

  test('logout clears the cookie', async () => {
    await makeStudent({ username: 'logoutuser' });
    const agent = request.agent(app);
    await agent.post('/auth/login').send({ identifier: 'logoutuser', password: 'Student@123' });

    const res = await agent.post('/auth/logout');
    expect(res.status).toBe(200);
    const cookie = (res.headers['set-cookie'] ?? []).find((c) => c.startsWith('lp_token='));
    expect(cookie).toMatch(/lp_token=;/);
  });

  test('register creates a student and never an admin', async () => {
    const res = await request(app).post('/auth/register').send({
      name: 'Self Registered',
      username: 'selfreg',
      password: 'Student@123',
      role: 'admin'
    });

    // .strict() rejects `role` outright.
    expect(res.status).toBe(400);

    const created = await request(app).post('/auth/register').send({
      name: 'Self Registered',
      username: 'selfreg',
      password: 'Student@123'
    });

    expect(created.status).toBe(201);
    expect(created.body.data.user.role).toBe('student');
    expect(created.body.data.user.passwordHash).toBeUndefined();
  });

  test('register refuses a duplicate username with 409', async () => {
    await makeStudent({ username: 'taken' });
    const res = await request(app)
      .post('/auth/register')
      .send({ name: 'Dup', username: 'taken', password: 'Student@123' });

    expect(res.status).toBe(409);
  });

  test('a garbage token is rejected as 401', async () => {
    const res = await request(app)
      .get('/auth/me')
      .set('Cookie', 'lp_token=not-a-real-jwt');
    expect(res.status).toBe(401);
  });
});

describe('role-based access control', () => {
  test('student calling an admin route gets 403', async () => {
    const agent = request.agent(app);
    await makeStudent({ username: 'normalstudent' });
    await agent.post('/auth/login').send({ identifier: 'normalstudent', password: 'Student@123' });

    const res = await agent.get('/admin/students');
    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  test('student calling an admin write route gets 403', async () => {
    const agent = request.agent(app);
    await makeStudent({ username: 'writer' });
    await agent.post('/auth/login').send({ identifier: 'writer', password: 'Student@123' });

    const res = await agent.post('/admin/questions').send({
      subject: 'X',
      topic: 'Y',
      questionText: 'Should not be created',
      options: ['a', 'b'],
      correctIndex: 0
    });

    expect(res.status).toBe(403);
  });

  test('anonymous caller gets 401 before any role check', async () => {
    const res = await request(app).get('/admin/students');
    expect(res.status).toBe(401);
  });

  test('admin can list students', async () => {
    const admin = await makeAdmin({ username: 'boss' });
    await makeStudent({ username: 'listed' });

    const agent = request.agent(app);
    await agent.post('/auth/login').send({ identifier: admin.username, password: 'Student@123' });

    const res = await agent.get('/admin/students');
    expect(res.status).toBe(200);
    expect(res.body.data.items.some((s) => s.username === 'listed')).toBe(true);
    expect(res.body.data.items[0].passwordHash).toBeUndefined();
  });
});