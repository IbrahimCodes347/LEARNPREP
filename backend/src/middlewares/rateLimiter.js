import rateLimit from 'express-rate-limit';
import { RATE_LIMITS } from '../utils/constants.js';

const shared = {
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests. Please try again later.' }
};

export const apiLimiter = rateLimit({
  windowMs: RATE_LIMITS.WINDOW_MINUTES * 60 * 1000,
  max: RATE_LIMITS.API_MAX,
  ...shared
});

export const loginLimiter = rateLimit({
  windowMs: RATE_LIMITS.WINDOW_MINUTES * 60 * 1000,
  max: RATE_LIMITS.LOGIN_MAX,
  ...shared,
  skipSuccessfulRequests: true
});

export default { apiLimiter, loginLimiter };
