import { z } from 'zod';
import { DIFFICULTIES } from '../utils/constants.js';
import { gradeField, objectId, optionalWhenBlank } from './commonSchemas.js';

// Normalises casing so "HARD" and "Hard" both work (enum check runs after lowercase).
const difficultyField = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.enum(DIFFICULTIES));

export const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20)
});

export const saveAnswerSchema = z
  .object({
    questionId: objectId,
    selectedIndex: z.number().int().min(0).max(50).nullable().optional().default(null),
    timeSpentSec: z.coerce.number().int().min(0).max(86_400).default(0)
  })
  .strict();

export const eventSchema = z
  .object({
    type: z.literal('tab_switch')
  })
  .strict();

export const listAttemptsQuery = paginationQuery.extend({
  testId: objectId.optional(),
  status: z.enum(['in_progress', 'submitted']).optional()
});

export const subjectQuery = paginationQuery.extend({
  subject: z.string().trim().max(80).optional()
});

export const bookmarkSchema = z
  .object({
    questionId: objectId,
    note: z.string().trim().max(500).default('')
  })
  .strict();

export const bookmarkParamSchema = z.object({ questionId: objectId }).strict();

export const createStudentSchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    username: optionalWhenBlank(
      z
        .string()
        .trim()
        .toLowerCase()
        .regex(/^[a-z0-9._-]{3,40}$/)
    ),
    email: optionalWhenBlank(z.string().trim().toLowerCase().email().max(120)),
    rollno: optionalWhenBlank(
      z
        .string()
        .trim()
        .toUpperCase()
        .regex(/^[A-Z0-9/-]{1,30}$/)
    ),
    password: z.string().min(8).max(128),
    grade: gradeField,
    isActive: z.boolean().optional().default(true)
  })
  .strict()
  .refine((v) => Boolean(v.username || v.email || v.rollno), {
    message: 'Provide a username, email or roll number',
    path: ['username']
  });

export const updateStudentSchema = z
  .object({
    name: z.string().trim().min(2).max(80).optional(),
    username: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9._-]{3,40}$/)
      .nullable()
      .optional(),
    email: z.string().trim().toLowerCase().email().max(120).nullable().optional(),
    rollno: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9/-]{1,30}$/)
      .nullable()
      .optional(),
    grade: gradeField.nullable(),
    isActive: z.boolean().optional(),
    password: z.string().min(8).max(128).optional()
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'No fields to update' });

export const listStudentsQuery = paginationQuery.extend({
  search: z.string().trim().max(80).optional(),
  grade: z.string().trim().max(40).optional(),
  status: z.enum(['active', 'inactive']).optional()
});

export const createQuestionSchema = z
  .object({
    subject: z.string().trim().min(1).max(80),
    topic: z.string().trim().min(1).max(80),
    difficulty: z.enum(DIFFICULTIES).default('medium'),
    questionText: z.string().trim().min(3).max(2000),
    options: z.array(z.string().trim().min(1).max(500)).min(2).max(10),
    correctIndex: z.number().int().min(0),
    marks: z.coerce.number().min(0).max(100).default(1),
    explanation: z.string().trim().max(2000).default('')
  })
  .strict()
  .refine((v) => v.correctIndex < v.options.length, {
    message: 'correctIndex must match one of the options',
    path: ['correctIndex']
  });

// Built from the shape (not the refined schema) so .partial() is available.
export const updateQuestionSchema = z
  .object({
    subject: z.string().trim().min(1).max(80),
    topic: z.string().trim().min(1).max(80),
    difficulty: z.enum(DIFFICULTIES),
    questionText: z.string().trim().min(3).max(2000),
    options: z.array(z.string().trim().min(1).max(500)).min(2).max(10),
    correctIndex: z.number().int().min(0),
    marks: z.coerce.number().min(0).max(100),
    explanation: z.string().trim().max(2000)
  })
  .strict()
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'No fields to update' })
  .refine(
    (v) => v.options === undefined || v.correctIndex === undefined || v.correctIndex < v.options.length,
    { message: 'correctIndex must match one of the options', path: ['correctIndex'] }
  );

export const listQuestionsQuery = paginationQuery.extend({
  subject: z.string().trim().max(80).optional(),
  topic: z.string().trim().max(80).optional(),
  difficulty: z.enum(DIFFICULTIES).optional(),
  search: z.string().trim().max(120).optional(),
  deleted: z.enum(['true', 'false']).optional()
});

export const generateTestSchema = z
  .object({
    title: z.string().trim().min(3).max(140),
    subject: z.string().trim().min(1).max(80),
    description: z.string().trim().max(500).default(''),
    count: z.coerce.number().int().min(1).max(200),
    topics: z.array(z.string().trim().min(1).max(80)).max(50).default([]),
    difficulties: z.array(difficultyField).max(3).default([]),
    durationMinutes: z.coerce.number().int().min(1).max(600).default(30),
    negativeMarks: z.coerce.number().min(0).max(100).default(0),
    passMarks: z.coerce.number().min(0).nullable().default(null),
    shuffle: z.boolean().default(true),
    isAdaptive: z.boolean().default(false),
    maxTabSwitches: z.coerce.number().int().min(0).max(50).default(3),
    maxAttempts: z.coerce.number().int().min(0).max(20).default(1),
    status: z.enum(['draft', 'active', 'inactive']).default('draft'),
    activeFrom: z.coerce.date().nullable().default(null),
    activeUntil: z.coerce.date().nullable().default(null)
  })
  .strict()
  .refine((v) => !v.activeFrom || !v.activeUntil || v.activeUntil > v.activeFrom, {
    message: 'activeUntil must be after activeFrom',
    path: ['activeUntil']
  });

export const updateTestSchema = z
  .object({
    title: z.string().trim().min(3).max(140).optional(),
    description: z.string().trim().max(500).optional(),
    durationMinutes: z.coerce.number().int().min(1).max(600).optional(),
    negativeMarks: z.coerce.number().min(0).max(100).optional(),
    passMarks: z.coerce.number().min(0).nullable().optional(),
    shuffle: z.boolean().optional(),
    isAdaptive: z.boolean().optional(),
    maxTabSwitches: z.coerce.number().int().min(0).max(50).optional(),
    maxAttempts: z.coerce.number().int().min(0).max(20).optional(),
    status: z.enum(['draft', 'active', 'inactive']).optional(),
    activeFrom: z.coerce.date().nullable().optional(),
    activeUntil: z.coerce.date().nullable().optional()
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'No fields to update' });

export const listAdminTestsQuery = paginationQuery.extend({
  status: z.enum(['draft', 'active', 'inactive']).optional(),
  subject: z.string().trim().max(80).optional()
});

export const giveExtraAttemptSchema = z.object({ userId: objectId }).strict();

export const analyticsQuestionsQuery = paginationQuery.extend({
  testId: objectId.optional(),
  subject: z.string().trim().max(80).optional(),
  topic: z.string().trim().max(80).optional(),
  difficulty: z.enum(DIFFICULTIES).optional()
});

export const questionAttemptsQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50)
});

export const classStatsQuery = z.object({
  grade: z.string().trim().max(40).optional()
});

export const studentReportQuery = paginationQuery.extend({
  grade: z.string().trim().max(40).optional(),
  testId: objectId.optional(),
  search: z.string().trim().max(80).optional(),
  status: z.enum(['passed', 'failed']).optional(),
  sortBy: z
    .enum([
      'name',
      'username',
      'rollno',
      'avgPercentage',
      'bestPercentage',
      'lastPercentage',
      'attemptsCount',
      'lastAttemptAt',
      'status'
    ])
    .default('avgPercentage'),
  sortDir: z.enum(['asc', 'desc']).default('desc')
});

export const studentProgressQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20)
});

export const adminAttemptsQuery = paginationQuery.extend({
  testId: objectId.optional(),
  autoSubmitted: z.enum(['true', 'false']).optional(),
  hasTabSwitches: z.enum(['true', 'false']).optional(),
  status: z.enum(['in_progress', 'submitted']).optional()
});
