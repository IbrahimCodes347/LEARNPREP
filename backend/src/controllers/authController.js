import { User } from '../models/User.js';
import { env } from '../config/env.js';
import ApiError from '../utils/ApiError.js';
import { ROLES } from '../utils/constants.js';
import { clearAuthCookie, setAuthCookie, signToken } from '../utils/token.js';
import { ok, created } from '../utils/response.js';
import { emailEnabled, sendWelcomeEmail } from '../services/emailService.js';

const GENERIC_LOGIN_ERROR = 'Invalid username or password';

function findByIdentifier(identifier) {
  const lower = identifier.toLowerCase();
  return User.findOne({
    $or: [{ username: lower }, { email: lower }, { rollno: identifier.toUpperCase() }]
  }).select('+passwordHash');
}

/**
 * Every failure path returns the same 401 - no hints about which field was wrong
 * or whether the account exists / is deactivated.
 */
export async function login(req, res) {
  const { identifier, password, grade } = req.body;

  const user = await findByIdentifier(identifier);
  const okPassword = user ? await user.verifyPassword(password) : false;

  if (
    !user ||
    !okPassword ||
    !user.isActive ||
    user.isDeleted ||
    (grade && user.grade && grade !== user.grade)
  ) {
    throw ApiError.unauthorized(GENERIC_LOGIN_ERROR);
  }

  setAuthCookie(res, signToken(user));
  return ok(res, { user: user.toPublic() }, 'Logged in');
}

export async function register(req, res) {
  if (!env.ALLOW_SELF_REGISTER) {
    throw ApiError.forbidden('Self registration is disabled. Ask your admin for an account.');
  }

  const { name, username, email, rollno, password, grade } = req.body;
  const payload = {
    name,
    grade: grade ?? 'TYCS Sem V',
    role: ROLES.STUDENT, // schema strips role, so this can never be admin
    isActive: true
  };
  if (username) payload.username = username;
  if (email) payload.email = email;
  if (rollno) payload.rollno = rollno;

  const user = new User(payload);
  await user.setPassword(password);

  try {
    await user.save();
  } catch (err) {
    if (err.code === 11000)
      throw ApiError.conflict('That username, email or roll number is already registered');
    throw err;
  }

  setAuthCookie(res, signToken(user));

  // Fire-and-forget welcome email (skips silently when disabled or no email).
  if (emailEnabled()) sendWelcomeEmail({ userId: user._id });

  return created(res, { user: user.toPublic() }, 'Account created');
}

export function logout(req, res) {
  clearAuthCookie(res);
  return ok(res, null, 'Logged out');
}

export function me(req, res) {
  return ok(res, { user: req.user.toPublic(), allowSelfRegister: env.ALLOW_SELF_REGISTER }, 'Session active');
}

export default { login, register, logout, me };
