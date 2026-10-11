import { Router } from 'express';
import multer from 'multer';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import auth from '../middlewares/auth.js';
import requireRole from '../middlewares/requireRole.js';
import validate from '../middlewares/validate.js';
import * as c from '../controllers/adminController.js';
import { idParam } from '../validators/commonSchemas.js';
import {
  adminAttemptsQuery,
  analyticsQuestionsQuery,
  classStatsQuery,
  createQuestionSchema,
  createStudentSchema,
  generateTestSchema,
  giveExtraAttemptSchema,
  listAdminTestsQuery,
  listQuestionsQuery,
  listStudentsQuery,
  questionAttemptsQuery,
  studentProgressQuery,
  studentReportQuery,
  updateQuestionSchema,
  updateStudentSchema,
  updateTestSchema
} from '../validators/apiSchemas.js';
import { ALLOWED_UPLOAD_EXTENSIONS, MAX_UPLOAD_BYTES } from '../utils/constants.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
  fileFilter(req, file, cb) {
    const name = String(file.originalname ?? '').toLowerCase();
    const ext = name.slice(name.lastIndexOf('.'));
    const okExt = ALLOWED_UPLOAD_EXTENSIONS.includes(ext);
    const okMime = [
      'text/csv',
      'application/json',
      'text/plain',
      'application/octet-stream',
      'application/vnd.ms-excel'
    ].includes(file.mimetype);
    if (okExt && okMime) return cb(null, true);
    return cb(Object.assign(new Error('Only .csv or .json files are allowed'), { status: 400 }));
  }
});

const router = Router();

// Whole admin router is authenticated + admin-only (one place, per Security.md).
router.use(auth, requireRole('admin'));

router.get('/students', validate(listStudentsQuery, 'query'), asyncHandler(c.listStudents));
router.post('/students', validate(createStudentSchema, 'body'), asyncHandler(c.createStudent));
router.post('/students/bulk', upload.single('file'), asyncHandler(c.bulkImportStudents));
router.get(
  '/students/:id/progress',
  validate(idParam, 'params'),
  validate(studentProgressQuery, 'query'),
  asyncHandler(c.studentProgressRoute)
);
router.patch(
  '/students/:id',
  validate(idParam, 'params'),
  validate(updateStudentSchema, 'body'),
  asyncHandler(c.updateStudent)
);
router.delete('/students/:id', validate(idParam, 'params'), asyncHandler(c.deleteStudent));

router.get('/questions', validate(listQuestionsQuery, 'query'), asyncHandler(c.listQuestions));
router.post('/questions', validate(createQuestionSchema, 'body'), asyncHandler(c.createQuestion));
router.get('/questions/meta', asyncHandler(c.bankMeta));
router.get('/questions/bank', asyncHandler(c.bankBreakdownRoute));
router.post('/questions/bulk', upload.single('file'), asyncHandler(c.bulkImportQuestions));
router.post('/questions/:id/restore', validate(idParam, 'params'), asyncHandler(c.restoreQuestion));
router.patch(
  '/questions/:id',
  validate(idParam, 'params'),
  validate(updateQuestionSchema, 'body'),
  asyncHandler(c.updateQuestion)
);
router.delete('/questions/:id', validate(idParam, 'params'), asyncHandler(c.softDeleteQuestion));

router.get('/tests', validate(listAdminTestsQuery, 'query'), asyncHandler(c.listAdminTests));
router.post('/tests/generate', validate(generateTestSchema, 'body'), asyncHandler(c.createTest));
router.post(
  '/tests/:id/extra-attempt',
  validate(idParam, 'params'),
  validate(giveExtraAttemptSchema, 'body'),
  asyncHandler(c.giveExtraAttempt)
);
router.patch(
  '/tests/:id',
  validate(idParam, 'params'),
  validate(updateTestSchema, 'body'),
  asyncHandler(c.updateTest)
);
router.delete('/tests/:id', validate(idParam, 'params'), asyncHandler(c.deleteTest));

router.get(
  '/analytics/questions',
  validate(analyticsQuestionsQuery, 'query'),
  asyncHandler(c.analyticsQuestions)
);
router.get(
  '/analytics/questions/:id/attempts',
  validate(idParam, 'params'),
  validate(questionAttemptsQuery, 'query'),
  asyncHandler(c.analyticsQuestionAttempts)
);
router.get('/analytics/classes', validate(classStatsQuery, 'query'), asyncHandler(c.analyticsClassStats));
router.get(
  '/reports/students',
  validate(studentReportQuery, 'query'),
  asyncHandler(c.studentReportRoute)
);
router.get(
  '/reports/students/:id/history',
  validate(idParam, 'params'),
  asyncHandler(c.studentHistoryRoute)
);
router.get('/attempts', validate(adminAttemptsQuery, 'query'), asyncHandler(c.attemptLogsRoute));

router.get('/dashboard', asyncHandler(c.adminDashboard));

router.get('/export/students', asyncHandler(c.exportStudentsCsv));
router.get('/export/questions', asyncHandler(c.exportQuestionsCsv));
router.get('/export/attempts', asyncHandler(c.exportAttemptsCsv));

router.get('/import-templates/:kind', asyncHandler(c.importTemplates));

export default router;
