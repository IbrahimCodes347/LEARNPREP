import { Router } from 'express';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import validate from '../middlewares/validate.js';
import auth from '../middlewares/auth.js';
import * as c from '../controllers/studentController.js';
import { idParam } from '../validators/commonSchemas.js';
import {
  bookmarkParamSchema,
  bookmarkSchema,
  eventSchema,
  listAttemptsQuery,
  paginationQuery,
  saveAnswerSchema,
  subjectQuery
} from '../validators/apiSchemas.js';

const router = Router();

// `auth` is declared per route instead of via router.use(), so an unmatched
// path falls through to the 404 handler rather than returning 401.

router.get('/tests', auth, validate(subjectQuery, 'query'), asyncHandler(c.listTests));
router.get('/tests/subjects', auth, asyncHandler(c.listSubjectsRoute));
router.get('/tests/:id', auth, validate(idParam, 'params'), asyncHandler(c.getTest));
router.post('/tests/:id/start', auth, validate(idParam, 'params'), asyncHandler(c.start));
router.get('/tests/:id/leaderboard', auth, validate(idParam, 'params'), asyncHandler(c.leaderboard));

router.get('/attempts/mine', auth, validate(listAttemptsQuery, 'query'), asyncHandler(c.myAttempts));
router.patch(
  '/attempts/:id/answers',
  auth,
  validate(idParam, 'params'),
  validate(saveAnswerSchema, 'body'),
  asyncHandler(c.saveAnswerRoute)
);
router.post(
  '/attempts/:id/events',
  auth,
  validate(idParam, 'params'),
  validate(eventSchema, 'body'),
  asyncHandler(c.logEvent)
);
router.post('/attempts/:id/submit', auth, validate(idParam, 'params'), asyncHandler(c.submit));
router.get('/attempts/:id/result', auth, validate(idParam, 'params'), asyncHandler(c.result));
router.get('/attempts/:id/report', auth, validate(idParam, 'params'), asyncHandler(c.report));

router.get('/bookmarks', auth, validate(paginationQuery, 'query'), asyncHandler(c.listBookmarks));
router.post('/bookmarks', auth, validate(bookmarkSchema, 'body'), asyncHandler(c.addBookmark));
router.delete(
  '/bookmarks/:questionId',
  auth,
  validate(bookmarkParamSchema, 'params'),
  asyncHandler(c.removeBookmark)
);

router.get('/dashboard', auth, asyncHandler(c.dashboard));

export default router;
