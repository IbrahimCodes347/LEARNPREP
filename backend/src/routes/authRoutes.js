import { Router } from 'express';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { loginLimiter } from '../middlewares/rateLimiter.js';
import validate from '../middlewares/validate.js';
import * as authController from '../controllers/authController.js';
import { loginSchema, registerSchema } from '../validators/commonSchemas.js';
import auth from '../middlewares/auth.js';

const router = Router();

router.post('/login', loginLimiter, validate(loginSchema, 'body'), asyncHandler(authController.login));
router.post(
  '/register',
  loginLimiter,
  validate(registerSchema, 'body'),
  asyncHandler(authController.register)
);
router.post('/logout', auth, asyncHandler(authController.logout));
router.get('/me', auth, asyncHandler(authController.me));

export default router;
