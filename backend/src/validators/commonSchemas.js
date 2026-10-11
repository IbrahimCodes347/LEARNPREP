import { z } from 'zod';
import { GRADE_OPTIONS, GRADE_OPTIONS_LOWER, normalizeGrade } from '../utils/constants.js';

const GRADE_OPTION_LABEL = `Class must be one of: ${GRADE_OPTIONS.join(', ')}`;

export const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

export const idParam = z.object({ id: objectId }).strict();

const trimmed = (min, max) => z.string().trim().min(min).max(max);

/**
 * Treats a blank string as "not provided" so the field is omitted.
 * Without this `email: ""` fails the .email() check, and a null reaching the model
 * lands in the unique index where the second blank value collides (E11000).
 * Shared by the register / admin-create / CSV-import schemas.
 */
export const optionalWhenBlank = (schema) =>
  z.preprocess((v) => (typeof v === 'string' && v.trim() === '' ? undefined : v), schema.optional());

/**
 * Class/grade the report can group by. Blank is "not provided" (-> Unassigned),
 * anything else must match a canonical class in GRADE_OPTIONS, case- and
 * space-insensitively. Values that match are normalised to the canonical
 * spelling before being saved, so new junk ("t", "10", "nxx") can no longer be
 * created. Shared by admin create/edit, self-register and CSV bulk import.
 */
export const gradeField = optionalWhenBlank(
  z
    .string()
    .trim()
    .superRefine((value, ctx) => {
      const canonical = normalizeGrade(value);
      if (canonical === null || !GRADE_OPTIONS_LOWER.includes(canonical.toLowerCase())) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: GRADE_OPTION_LABEL });
      }
    })
    .transform((value) => normalizeGrade(value))
);

export const identifierSchema = z
  .string()
  .trim()
  .min(3, 'Enter your username, email or roll number')
  .max(120);

export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password is too long');

export const loginSchema = z
  .object({
    identifier: identifierSchema,
    password: z.string().min(1, 'Password is required').max(128),
    grade: trimmed(1, 40).optional()
  })
  .strict();

export const registerSchema = z
  .object({
    name: trimmed(2, 80),
    username: optionalWhenBlank(
      z
        .string()
        .trim()
        .toLowerCase()
        .regex(/^[a-z0-9._-]{3,40}$/, 'Username may use letters, numbers, dot, dash, underscore')
    ),
    email: optionalWhenBlank(z.string().trim().toLowerCase().email('Enter a valid email').max(120)),
    rollno: optionalWhenBlank(
      z
        .string()
        .trim()
        .toUpperCase()
        .regex(/^[A-Z0-9/-]{1,30}$/, 'Roll number contains invalid characters')
    ),
    password: passwordSchema,
    grade: gradeField
  })
  .strict()
  .refine((v) => Boolean(v.username || v.email || v.rollno), {
    message: 'Provide a username, email or roll number',
    path: ['username']
  });
