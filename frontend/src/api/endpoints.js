import http from './http';

/** Every URL in the app is built here (Rules.md: components never build URLs). */

export const unwrap = (promise) => promise.then((r) => r.data?.data);

export const auth = {
  login: (body) => unwrap(http.post('/auth/login', body)),
  register: (body) => unwrap(http.post('/auth/register', body)),
  logout: () => unwrap(http.post('/auth/logout')),
  me: () => unwrap(http.get('/auth/me'))
};

export const tests = {
  list: (params) => unwrap(http.get('/tests', { params })),
  subjects: () => unwrap(http.get('/tests/subjects')),
  get: (id) => unwrap(http.get(`/tests/${id}`)),
  start: (id) => unwrap(http.post(`/tests/${id}/start`)),
  leaderboard: (id) => unwrap(http.get(`/tests/${id}/leaderboard`))
};

export const attempts = {
  mine: (params) => unwrap(http.get('/attempts/mine', { params })),
  saveAnswer: (id, body) => unwrap(http.patch(`/attempts/${id}/answers`, body)),
  logEvent: (id, body) => unwrap(http.post(`/attempts/${id}/events`, body)),
  submit: (id) => unwrap(http.post(`/attempts/${id}/submit`)),
  result: (id) => unwrap(http.get(`/attempts/${id}/result`)),
  reportUrl: (id) => `${http.defaults.baseURL}/attempts/${id}/report`
};

export const bookmarks = {
  list: (params) => unwrap(http.get('/bookmarks', { params })),
  add: (body) => unwrap(http.post('/bookmarks', body)),
  remove: (questionId) => unwrap(http.delete(`/bookmarks/${questionId}`))
};

export const dashboard = {
  get: () => unwrap(http.get('/dashboard'))
};

/** Public app metadata: allowed classes + the pass mark (never hardcoded). */
export const config = {
  get: () => unwrap(http.get('/config'))
};

export const admin = {
  listStudents: (params) => unwrap(http.get('/admin/students', { params })),
  createStudent: (body) => unwrap(http.post('/admin/students', body)),
  updateStudent: (id, body) => unwrap(http.patch(`/admin/students/${id}`, body)),
  deleteStudent: (id) => unwrap(http.delete(`/admin/students/${id}`)),
  studentProgress: (id, params) => unwrap(http.get(`/admin/students/${id}/progress`, { params })),
  bulkStudents: (file) => {
    const form = new FormData();
    form.append('file', file);
    return unwrap(http.post('/admin/students/bulk', form, { headers: { 'Content-Type': undefined } }));
  },

  listQuestions: (params) => unwrap(http.get('/admin/questions', { params })),
  createQuestion: (body) => unwrap(http.post('/admin/questions', body)),
  updateQuestion: (id, body) => unwrap(http.patch(`/admin/questions/${id}`, body)),
  deleteQuestion: (id) => unwrap(http.delete(`/admin/questions/${id}`)),
  restoreQuestion: (id) => unwrap(http.post(`/admin/questions/${id}/restore`)),
  bulkQuestions: (file) => {
    const form = new FormData();
    form.append('file', file);
    return unwrap(http.post('/admin/questions/bulk', form, { headers: { 'Content-Type': undefined } }));
  },
  questionMeta: () => unwrap(http.get('/admin/questions/meta')),
  bankBreakdown: () => unwrap(http.get('/admin/questions/bank')),

  listTests: (params) => unwrap(http.get('/admin/tests', { params })),
  generateTest: (body) => unwrap(http.post('/admin/tests/generate', body)),
  updateTest: (id, body) => unwrap(http.patch(`/admin/tests/${id}`, body)),
  giveExtraAttempt: (id, body) => unwrap(http.post(`/admin/tests/${id}/extra-attempt`, body)),
  deleteTest: (id) => unwrap(http.delete(`/admin/tests/${id}`)),

  analyticsQuestions: (params) => unwrap(http.get('/admin/analytics/questions', { params })),
  analyticsQuestionAttempts: (id, params) =>
    unwrap(http.get(`/admin/analytics/questions/${id}/attempts`, { params })),
  analyticsClasses: (params) => unwrap(http.get('/admin/analytics/classes', { params })),
  studentReport: (params) => unwrap(http.get('/admin/reports/students', { params })),
  studentHistory: (id) => unwrap(http.get(`/admin/reports/students/${id}/history`)),
  attemptLogs: (params) => unwrap(http.get('/admin/attempts', { params })),
  dashboard: () => unwrap(http.get('/admin/dashboard')),

  exportUrl: (kind) => `${http.defaults.baseURL}/admin/export/${kind}`,
  importTemplateUrl: (kind) => `${http.defaults.baseURL}/admin/import-templates/${kind}`
};

export default { auth, tests, attempts, bookmarks, dashboard, config, admin };