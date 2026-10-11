import { User } from '../models/User.js';
import { ApiError } from '../utils/ApiError.js';
import { readToken, verifyToken } from '../utils/token.js';
import { asyncHandler } from './asyncHandler.js';

export const auth = asyncHandler(async (req, res, next) => {
  const token = readToken(req);
  if (!token) throw ApiError.unauthorized('Authentication required');

  let payload;
  try {
    payload = verifyToken(token);
  } catch {
    throw ApiError.unauthorized('Invalid or expired session');
  }

  const user = await User.findById(payload.sub).select('+passwordHash');
  if (!user) throw ApiError.unauthorized('Invalid or expired session');
  // A deleted student loses their open session on the very next request.
  if (user.isDeleted) throw ApiError.unauthorized('Invalid or expired session');

  req.user = user;
  return next();
});

export default auth;
