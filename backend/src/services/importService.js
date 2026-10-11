import { parse as parseCsv } from 'csv-parse/sync';
import { z } from 'zod';
import { Question } from '../models/Question.js';
import { User } from '../models/User.js';
import ApiError from '../utils/ApiError.js';
import { DIFFICULTIES, ROLES } from '../utils/constants.js';
import { createLogger } from '../utils/logger.js';
import { optionalWhenBlank, gradeField } from '../validators/commonSchemas.js';

const log = createLogger('import');

const studentRowSchema = z.object({
  name: z.string().trim().min(2).max(80),
  username: optionalWhenBlank(
    z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9._-]{3,40}$/, 'invalid username')
  ),
  email: optionalWhenBlank(z.string().trim().toLowerCase().email('invalid email')),
  rollno: optionalWhenBlank(
    z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9/-]{1,30}$/, 'invalid roll number')
  ),
  password: z.string().min(8).max(128),
  grade: gradeField
});

const questionRowSchema = z.object({
  subject: z.string().trim().min(1).max(80),
  topic: z.string().trim().min(1).max(80),
  difficulty: z.enum(DIFFICULTIES),
  questionText: z.string().trim().min(3).max(2000),
  options: z.array(z.string().trim().min(1).max(500)).min(2).max(10),
  correctIndex: z.coerce.number().int().min(0),
  marks: z.coerce.number().min(0).max(100).optional(),
  explanation: z.string().trim().max(2000).optional()
});

const toArray = (v) =>
  String(v ?? '')
    .split('|')
    .map((s) => s.trim())
    .filter(Boolean);

function parseRows({ buffer, filename }) {
  const ext = String(filename ?? '')
    .toLowerCase()
    .slice(filename.lastIndexOf('.'));
  const text = buffer.toString('utf8');

  if (ext === '.json') {
    try {
      const parsed = JSON.parse(text);
      const rows = Array.isArray(parsed) ? parsed : (parsed.data ?? parsed.items ?? []);
      if (!Array.isArray(rows)) throw new Error('JSON must be an array of rows');
      return rows;
    } catch (err) {
      log.warn('JSON import rejected:', err.message);
      throw ApiError.badRequest('Could not parse the JSON file. Check its format.');
    }
  }

  try {
    return parseCsv(text, {
      columns: (header) => header.map((h) => String(h).trim().toLowerCase()),
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true
    });
  } catch (err) {
    log.warn('CSV import rejected:', err.message);
    throw ApiError.badRequest('Could not parse the CSV file. Check its format.');
  }
}

/**
 * Imports students. One bad row never blocks the rest: each row is validated,
 * inserted independently and reported individually.
 */
export async function importStudents({ buffer, filename, createdBy }) {
  const rows = parseRows({ buffer, filename });
  if (!rows.length) throw ApiError.badRequest('The uploaded file has no rows');

  const created = [];
  const errors = [];

  for (const [index, raw] of rows.entries()) {
    const rowNumber = index + 2; // +1 header, +1 for 1-based
    try {
      const parsed = studentRowSchema.safeParse({
        name: raw.name ?? raw.Name,
        username: raw.username ?? raw.Username ?? undefined,
        email: raw.email ?? raw.Email ?? undefined,
        rollno: raw.rollno ?? raw.roll ?? raw.rollNo ?? raw['roll number'] ?? undefined,
        password: raw.password ?? raw.Password,
        grade: raw.grade ?? raw.class ?? raw.Class ?? undefined
      });

      if (!parsed.success) {
        throw ApiError.badRequest(
          parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
        );
      }
      if (!parsed.data.username && !parsed.data.email && !parsed.data.rollno) {
        throw ApiError.badRequest('row needs at least one of username, email, rollno');
      }

      const user = new User({
        ...parsed.data,
        role: ROLES.STUDENT, // imported rows can never become admins
        grade: parsed.data.grade ?? undefined,
        createdBy: createdBy ?? null
      });
      await user.setPassword(parsed.data.password);
      await user.save();
      created.push({ row: rowNumber, id: String(user._id), name: user.name, username: user.username });
    } catch (err) {
      errors.push({ row: rowNumber, message: friendlyRowError(err), raw: sanitizeRaw(raw) });
    }
  }

  return { total: rows.length, createdCount: created.length, errorCount: errors.length, created, errors };
}

/** Imports questions from CSV (options separated by `|`) or JSON. */
export async function importQuestions({ buffer, filename, createdBy }) {
  const rows = parseRows({ buffer, filename });
  if (!rows.length) throw ApiError.badRequest('The uploaded file has no rows');

  const created = [];
  const errors = [];

  for (const [index, raw] of rows.entries()) {
    const rowNumber = index + 2;
    try {
      const options = Array.isArray(raw.options) ? raw.options : toArray(raw.options);
      const parsed = questionRowSchema.safeParse({
        subject: raw.subject ?? raw.Subject,
        topic: raw.topic ?? raw.Topic,
        difficulty: (raw.difficulty ?? raw.Difficulty ?? 'medium').toLowerCase(),
        questionText: raw.questionText ?? raw.questiontext ?? raw.question ?? raw.Question,
        options,
        correctIndex: raw.correctIndex ?? raw.correctindex ?? raw.correct ?? raw.CorrectIndex,
        marks: raw.marks === undefined || raw.marks === '' ? undefined : Number(raw.marks),
        explanation: raw.explanation ?? raw.Explanation ?? undefined
      });

      if (!parsed.success) {
        throw ApiError.badRequest(
          parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
        );
      }
      if (parsed.data.correctIndex >= parsed.data.options.length) {
        throw ApiError.badRequest('correctIndex is out of range for the given options');
      }

      const doc = await Question.create({
        subject: parsed.data.subject,
        topic: parsed.data.topic,
        difficulty: parsed.data.difficulty,
        questionText: parsed.data.questionText,
        options: parsed.data.options,
        correctIndex: parsed.data.correctIndex,
        marks: parsed.data.marks ?? 1,
        explanation: parsed.data.explanation ?? '',
        createdBy: createdBy ?? null
      });
      created.push({ row: rowNumber, id: String(doc._id), subject: doc.subject, topic: doc.topic });
    } catch (err) {
      errors.push({ row: rowNumber, message: friendlyRowError(err), raw: sanitizeRaw(raw) });
    }
  }

  return { total: rows.length, createdCount: created.length, errorCount: errors.length, created, errors };
}

function friendlyRowError(err) {
  if (err?.code === 11000) {
    const field = Object.keys(err.keyPattern ?? {})[0] ?? 'value';
    return `duplicate ${field}`;
  }
  // Mongoose validation: surface the field and its own message, not a generic one.
  if (err?.name === 'ValidationError' && err.errors) {
    return Object.values(err.errors)
      .map((e) => `${e.path}: ${e.message}`)
      .join('; ');
  }
  // Schema/row checks already build a specific message (e.g. "subject: ...").
  if (err?.name === 'ApiError' || err?.expose) return err.message;
  return 'row could not be saved';
}

/** Never echo passwords back in the error report. */
function sanitizeRaw(raw) {
  const clone = { ...raw };
  if ('password' in clone || 'Password' in clone) clone.password = '***';
  return clone;
}

export const CSV_TEMPLATES = Object.freeze({
  students: 'name,username,email,rollno,password,grade',
  questions: 'subject,topic,difficulty,questionText,options,correctIndex,marks,explanation'
});

export const SAMPLE_ROWS = Object.freeze({
  students: [
    {
      name: 'Aarav Sharma',
      username: 'aarav',
      email: 'aarav@example.com',
      rollno: 'TYCS-001',
      password: 'Student@123',
      grade: 'TYCS Sem V'
    },
    {
      name: 'Priya Patil',
      username: 'priya.p',
      email: 'priya@example.com',
      rollno: 'TYCS-002',
      password: 'Student@123',
      grade: 'TYCS Sem V'
    }
  ],
  questions: [
    {
      subject: 'Data Structures',
      topic: 'Trees',
      difficulty: 'medium',
      questionText: 'What is the worst-case time complexity of searching in an unbalanced BST?',
      options: ['O(log n)', 'O(n)', 'O(n log n)', 'O(log log n)'],
      correctIndex: 1,
      marks: 1,
      explanation: 'An unbalanced BST degenerates into a linked list, so search is O(n).'
    }
  ]
});

export function buildCsv({ columns, rows }) {
  const escape = (v) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = columns.join(',');
  const body = rows.map((r) => columns.map((c) => escape(r[c])).join(',')).join('\n');
  return `${head}\n${body}`;
}

export default { importStudents, importQuestions, buildCsv, CSV_TEMPLATES, SAMPLE_ROWS };
