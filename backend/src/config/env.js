import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const boolish = z
  .union([z.boolean(), z.string()])
  .transform((v) =>
    typeof v === 'boolean' ? v : ['true', '1', 'yes', 'on'].includes(String(v).toLowerCase())
  );

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(5000),
  MONGO_URI: z.string().min(1, 'MONGO_URI is required'),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
  JWT_EXPIRES_IN: z.string().default('1d'),
  CLIENT_ORIGIN: z.string().default('http://localhost:5173'),
  COOKIE_SAMESITE: z.enum(['lax', 'strict', 'none']).default('lax'),
  ALLOW_SELF_REGISTER: boolish.default(false),
  EMAIL_ENABLED: boolish.default(false),
  EMAIL_HOST: z.string().default('smtp.gmail.com'),
  EMAIL_PORT: z.coerce.number().int().positive().default(587),
  EMAIL_SECURE: boolish.default(false),
  EMAIL_USER: z.string().optional(),
  EMAIL_PASS: z.string().optional(),
  EMAIL_FROM: z.string().optional(),
  ADMIN_USERNAME: z.string().default('admin'),
  ADMIN_PASSWORD: z.string().min(8, 'ADMIN_PASSWORD must be at least 8 characters').default('Admin@12345'),
  ADMIN_NAME: z.string().default('Admin')
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
  console.error(
    `\n[env] Invalid environment configuration:\n${details}\n\nCopy .env.example to .env and fix the values above.\n`
  );
  process.exit(1);
}

const value = parsed.data;

if (value.COOKIE_SAMESITE === 'none' && value.NODE_ENV !== 'production') {
  console.warn('[env] COOKIE_SAMESITE=none requires HTTPS; browsers reject the cookie otherwise.');
}

export const env = Object.freeze({
  ...value,
  IS_PROD: value.NODE_ENV === 'production',
  IS_TEST: value.NODE_ENV === 'test',
  COOKIE_SECURE: value.NODE_ENV === 'production',
  ADMIN_ORIGIN: value.CLIENT_ORIGIN
});

export const ADMIN_SEED = Object.freeze({
  username: value.ADMIN_USERNAME,
  password: value.ADMIN_PASSWORD,
  name: value.ADMIN_NAME
});

export default env;
