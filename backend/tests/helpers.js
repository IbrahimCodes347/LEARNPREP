import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { Attempt } from '../src/models/Attempt.js';
import { Bookmark } from '../src/models/Bookmark.js';
import { Question } from '../src/models/Question.js';
import { Test } from '../src/models/Test.js';
import { User } from '../src/models/User.js';
import { ROLES, TEST_STATUS } from '../src/utils/constants.js';

export async function connect() {
  await mongoose.connect(process.env.MONGO_URI);
}

export async function disconnect() {
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();
}

export async function clear() {
  await Promise.all([
    User.deleteMany({}),
    Question.deleteMany({}),
    Test.deleteMany({}),
    Attempt.deleteMany({}),
    Bookmark.deleteMany({})
  ]);
}

export async function makeUser(overrides = {}) {
  const doc = new User({
    name: 'Test Student',
    username: `u${Math.random().toString(36).slice(2, 10)}`,
    email: `u${Math.random().toString(36).slice(2, 10)}@example.com`,
    rollno: `R${Math.floor(Math.random() * 100000)}`,
    role: ROLES.STUDENT,
    grade: 'TYCS Sem V',
    ...overrides
  });
  await doc.setPassword(overrides.password ?? 'Student@123');
  await doc.save();
  doc.password = undefined;
  return doc;
}

export async function makeAdmin(overrides = {}) {
  return makeUser({ role: ROLES.ADMIN, name: 'Admin', ...overrides });
}

export async function makeStudent(overrides = {}) {
  return makeUser({ role: ROLES.STUDENT, ...overrides });
}

export async function makeQuestion(overrides = {}) {
  return Question.create({
    subject: 'Data Structures',
    topic: 'Trees',
    difficulty: 'easy',
    questionText: `Question ${Math.random().toString(36).slice(2, 8)}`,
    options: ['A', 'B', 'C', 'D'],
    correctIndex: 0,
    marks: 1,
    explanation: 'because A',
    ...overrides
  });
}

export async function makeQuestions(count, overrides = {}) {
  const rows = [];
  for (let i = 0; i < count; i += 1) rows.push(await makeQuestion(overrides));
  return rows;
}

export async function makeTest(overrides = {}) {
  const questions = overrides.questionIds ?? (await makeQuestions(overrides.count ?? 5)).map((q) => q._id);
  const totalMarks = overrides.totalMarks ?? (await Question.find({ _id: { $in: questions } })).reduce(
    (sum, q) => sum + q.marks,
    0
  );

  return Test.create({
    title: 'Test',
    subject: 'Data Structures',
    durationMinutes: 30,
    questionIds: questions,
    totalMarks,
    negativeMarks: 0,
    passMarks: null,
    shuffle: true,
    status: TEST_STATUS.ACTIVE,
    // Fixtures default to unlimited attempts (production default is 1) so tests
    // that submit more than once for a student are unaffected.
    maxAttempts: 0,
    activeFrom: new Date(Date.now() - 60_000),
    activeUntil: new Date(Date.now() + 60 * 60 * 1000),
    ...overrides
  });
}

export { mongoose, bcrypt };