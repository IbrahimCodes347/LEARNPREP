# LearnPrep

A MERN-stack online exam-preparation platform with timed tests, server-side scoring, negative marking, leaderboards, weak-topic analytics, streaks and PDF result reports.

**Stack:** React 18 · Vite · Node.js (≥ 20) · Express · MongoDB · Socket.IO

---

## Table of Contents

1. [Overview](#1-overview)
2. [Features](#2-features)
3. [Tech Stack](#3-tech-stack)
4. [Project Structure](#4-project-structure)
5. [Getting Started](#5-getting-started)
6. [Environment Variables](#6-environment-variables)
7. [Available Scripts](#7-available-scripts)
8. [API Overview](#8-api-overview)
9. [Real-Time Leaderboard (Socket.IO)](#9-real-time-leaderboard-socketio)
10. [Background Jobs](#10-background-jobs)
11. [Security](#11-security)
12. [Testing](#12-testing)
13. [Bulk Import and Export](#13-bulk-import-and-export)
14. [Customisation](#14-customisation)
15. [Known Limitations](#15-known-limitations)
16. [Troubleshooting](#16-troubleshooting)

---

## 1. Overview

LearnPrep lets **admins** build a question bank, generate timed tests and track class performance, while **students** take tests, review results, bookmark questions and compete on leaderboards.

All scoring and deadline enforcement happens **on the server**. The test-start payload contains question text, options and marks, but never `correctIndex` or `explanation`. Those are revealed only after submission.

| Role | What they can do |
| --- | --- |
| **Student** | Browse tests, attempt them under a timer, view results and PDF reports, bookmark questions, see leaderboards, track streaks and weak topics |
| **Admin** | Manage students, questions and tests, bulk import via CSV/JSON, grade and class analytics, attempt logs, CSV exports, grant extra attempts |

---

## 2. Features

### Student
- Timed test engine with question palette, countdown timer and resume of in-progress attempts
- Server-side scoring with **negative marking** and per-topic break-up
- Result page with correct answers and explanations (shown only after submission)
- Downloadable **PDF result report**
- **Weak-topic analytics**, score trend chart and daily **streak** tracking
- Per-test **leaderboard** that updates live
- Question **bookmarks**
- Light/dark theme toggle

### Admin
- Student management: create, edit, delete, bulk import
- Question bank management: create, edit, soft delete and restore, bulk import
- Test generation from the bank by subject, topic and difficulty, with settings for duration, negative marks, pass marks, shuffle, attempt limit and active window
- Grade-wise reports, class roll-ups and topper lists
- Attempt logs with tab-switch counts and CSV exports
- Grant **extra attempts** to individual students

### Platform
- Cookie-based JWT authentication with role-based access control
- Rate limiting, Helmet headers, Zod request validation
- Auto-submit job for expired attempts
- Optional email: welcome, result report and streak reminder

---

## 3. Tech Stack

| Layer | Technologies |
| --- | --- |
| **Frontend** | React 18, Vite 5, React Router 6, TanStack Query 5, Axios, Tailwind CSS 4, daisyUI 5, Recharts, lucide-react, socket.io-client |
| **Backend** | Node.js (ESM), Express 4, Mongoose 8, Socket.IO 4, Zod, JWT, bcryptjs, Helmet, express-rate-limit, Multer, csv-parse, PDFKit, node-cron, Nodemailer |
| **Database** | MongoDB (Atlas or local) |
| **Testing and tooling** | Jest, Supertest, mongodb-memory-server, ESLint 9, Prettier |

---

## 4. Project Structure

```text
LEARNPREP-main/
├── README.md
├── .gitignore
├── backend/
│   ├── .env.example
│   ├── package.json
│   ├── jest.config.cjs
│   ├── eslint.config.js
│   ├── scripts/                 # seed, audit and maintenance scripts
│   │   ├── seed.js              # question bank, tests, admin and demo student
│   │   ├── seedAdmin.js         # admin account only
│   │   ├── seedDemo.js          # 10 demo students with attempts and bookmarks
│   │   ├── auditGrades.js       # flags non-standard grade values
│   │   ├── fixEmailIndex.js     # checks the users.email index
│   │   └── testEmail.js         # sends a real test email
│   ├── src/
│   │   ├── server.js            # entry point (HTTP, sockets, cron jobs)
│   │   ├── app.js               # Express app and middleware
│   │   ├── config/              # env validation (Zod) and DB connection
│   │   ├── routes/              # auth, student and admin routes
│   │   ├── controllers/
│   │   ├── services/            # scoring, attempts, analytics, email, PDF, import
│   │   ├── models/              # User, Question, Test, Attempt, Bookmark
│   │   ├── middlewares/         # auth, requireRole, validate, rateLimiter, errors
│   │   ├── validators/          # Zod schemas
│   │   ├── jobs/                # autoSubmitJob, streakCron
│   │   ├── sockets/             # Socket.IO leaderboard rooms
│   │   └── utils/               # constants, token, logger, response helpers
│   └── tests/                   # Jest suites (auth, attempt, score, admin, email...)
└── frontend/
    ├── .env.example
    ├── package.json
    ├── vite.config.js
    └── src/
        ├── App.jsx              # route table
        ├── api/                 # axios client, endpoints, socket client
        ├── components/          # admin, common, dashboard, layout, test
        ├── context/             # Auth and Theme providers
        ├── hooks/               # useAttempt, useTimer, useTabSwitch
        ├── lib/                 # React Query client and helpers
        └── pages/               # Login, Register, Dashboard, TestList, TestEngine,
                                 # Result, Leaderboard, Bookmarks, Admin
```

---

## 5. Getting Started

### Prerequisites

- **Node.js 20 or newer** (required by `backend/package.json`)
- **MongoDB**: a local instance or a MongoDB Atlas cluster
- npm (bundled with Node)

### Step 1. Backend setup

```bash
cd backend
npm install
cp .env.example .env        # Windows: copy .env.example .env
```

Open `.env` and set at least `MONGO_URI` and `JWT_SECRET` (see [Environment Variables](#6-environment-variables)). Generate a strong secret with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

### Step 2. Seed the database

```bash
npm run seed
```

This creates the question bank, three tests and two accounts:

| Role | Username | Password |
| --- | --- | --- |
| Admin | `admin` | `Admin000` |
| Student | `student` | `Student@123` |

> **Note:** Admin accounts can only be created by a seed script. There is no admin sign-up route. Change these credentials before any real deployment.

Optional extras:

```bash
npm run seed:demo           # 10 demo students with attempts, bookmarks and streaks
npm run seed:demo:reset     # remove demo data and re-create it
```

Demo students share the password `Demo@12345` (override with the `DEMO_PASSWORD` environment variable). Their emails use the `learnprep.demo` domain.

### Step 3. Start the backend

```bash
npm run dev                 # API at http://localhost:5000
```

### Step 4. Start the frontend

In a second terminal:

```bash
cd frontend
npm install
cp .env.example .env
npm run dev                 # UI at http://localhost:5173
```

Open **http://localhost:5173** and sign in with one of the seeded accounts.

> The frontend calls the API directly at `VITE_API_URL` (default `http://localhost:5000`), so API paths never collide with page routes. Only `/socket.io` is proxied in development. The server sends CORS credentials, so cookie sessions work across the two dev ports.

---

## 6. Environment Variables

### Backend (`backend/.env`)

| Variable | Required | Default | Description |
| --- | :---: | --- | --- |
| `NODE_ENV` | No | `development` | `development`, `test` or `production` |
| `PORT` | No | `5000` | API port |
| `MONGO_URI` | **Yes** | none | MongoDB connection string. Use database name `learnprep`, e.g. `mongodb://127.0.0.1:27017/learnprep` |
| `JWT_SECRET` | **Yes** | none | Signing key, at least 16 characters |
| `JWT_EXPIRES_IN` | No | `1d` | Token lifetime |
| `CLIENT_ORIGIN` | No | `http://localhost:5173` | Allowed frontend origin(s). Exact origin, no trailing slash, never `*` |
| `COOKIE_SAMESITE` | No | `lax` | `lax`, `strict` or `none`. Use `none` only for cross-domain over HTTPS |
| `ALLOW_SELF_REGISTER` | No | `false` in code, `true` in `.env.example` | Set `false` to disable the register page |
| `EMAIL_ENABLED` | No | `false` | Master switch for email |
| `EMAIL_HOST` | No | `smtp.gmail.com` | SMTP host |
| `EMAIL_PORT` | No | `587` | SMTP port |
| `EMAIL_SECURE` | No | `false` | `true` only for implicit TLS (port 465) |
| `EMAIL_USER` / `EMAIL_PASS` | If email on | none | SMTP credentials (Gmail needs an **App Password**) |
| `EMAIL_FROM` | No | `EMAIL_USER` | Display sender, e.g. `LearnPrep <noreply@example.com>` |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` / `ADMIN_NAME` | No | `admin` / `Admin@12345` / `Admin` | Used only by `npm run seed:admin` |

The server validates all variables at startup with Zod and exits with a clear message if something is missing or invalid.

### Frontend (`frontend/.env`)

| Variable | Default | Description |
| --- | --- | --- |
| `VITE_API_URL` | `http://localhost:5000` | Absolute URL of the backend. In production, set to the deployed API URL |

---

## 7. Available Scripts

### Backend (`cd backend`)

| Command | Description |
| --- | --- |
| `npm run dev` | Start the API with nodemon |
| `npm start` | Start the API with Node (production) |
| `npm run seed` | Seed question bank, tests, admin and demo student |
| `npm run seed:admin` | Create or update the admin account only |
| `npm run seed:demo` | Seed 10 demo students with attempt history |
| `npm run seed:demo:reset` | Remove demo data and re-seed |
| `npm test` | Run Jest against an in-memory MongoDB |
| `npm run test:email -- --to you@gmail.com` | Send a real test email |
| `npm run lint` | ESLint on `src/` |

### Frontend (`cd frontend`)

| Command | Description |
| --- | --- |
| `npm run dev` | Start the Vite dev server |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Preview the production build |
| `npm run lint` | ESLint on `src/` |

---

## 8. API Overview

Base URL: `http://localhost:5000`. Authentication uses an HTTP-only JWT cookie (`lp_token`). Responses follow a common `{ success, message, data }` shape.

### Public and auth

| Method | Endpoint | Description |
| --- | --- | --- |
| GET | `/` | Health message |
| GET | `/config` | Allowed classes, pass percentage |
| POST | `/auth/register` | Student self-registration (if enabled) |
| POST | `/auth/login` | Log in (rate limited) |
| POST | `/auth/logout` | Log out |
| GET | `/auth/me` | Current user |

### Student (login required)

| Method | Endpoint | Description |
| --- | --- | --- |
| GET | `/tests` | List available tests |
| GET | `/tests/subjects` | List subjects |
| GET | `/tests/:id` | Test details |
| POST | `/tests/:id/start` | Start or resume an attempt |
| GET | `/tests/:id/leaderboard` | Leaderboard for a test |
| GET | `/attempts/mine` | My attempts (filters: `status`, `testId`) |
| POST | `/attempts/:id/submit` | Submit an attempt |
| GET | `/attempts/:id/result` | Result with answers and explanations |
| GET | `/attempts/:id/report` | PDF result report |
| GET / POST / DELETE | `/bookmarks` | List, add and remove bookmarks |
| GET | `/dashboard` | Student dashboard analytics |

The attempt routes also include progress-saving and tab-switch reporting endpoints. See `backend/src/routes/studentRoutes.js`.

### Admin (`/admin/*`, admin role required)

| Area | Endpoints |
| --- | --- |
| **Students** | `GET/POST /admin/students`, `POST /admin/students/bulk`, `PATCH/DELETE /admin/students/:id` |
| **Questions** | `GET/POST /admin/questions`, `GET /admin/questions/meta`, `GET /admin/questions/bank`, `POST /admin/questions/bulk`, `PATCH/DELETE /admin/questions/:id`, `POST /admin/questions/:id/restore` |
| **Tests** | `GET /admin/tests`, `POST /admin/tests/generate`, `PATCH/DELETE /admin/tests/:id` |
| **Analytics** | `GET /admin/analytics/classes` and grade-report endpoints, `GET /admin/attempts`, `GET /admin/dashboard` |
| **Export / templates** | `GET /admin/export/{students,questions,attempts}`, `GET /admin/import-templates/:kind` |

---

## 9. Real-Time Leaderboard (Socket.IO)

- Connection is authenticated with the same JWT cookie. No token means no connection.
- Client emits `joinTest` and `leaveTest` with a test id. The server only allows joining tests the user may access.
- Server emits `leaderboard:joined` on join and `leaderboard:update` to the room `test:<id>` when a new result is submitted.
- The leaderboard shows each student's **best** submitted attempt, ranked by percentage and then earliest submission.

---

## 10. Background Jobs

| Job | File | Schedule | Purpose |
| --- | --- | --- | --- |
| Auto-submit | `jobs/autoSubmitJob.js` | Every minute | Finalises in-progress attempts that passed their deadline (plus a 5 s grace period) |
| Streak reminder | `jobs/streakCron.js` | Daily | Emails students who missed yesterday (only when `EMAIL_ENABLED=true`) |

---

## 11. Security

- **Server-side scoring.** Correct answers never reach the client before submission.
- **Server-enforced deadlines.** Closing the tab or losing connection does not extend an attempt.
- **Auth.** JWT in an HTTP-only cookie, `Secure` in production, configurable `SameSite`.
- **RBAC.** `requireRole('admin')` guards every `/admin` route.
- **Validation.** Zod schemas on request bodies, queries and params.
- **Rate limiting.** 300 requests per 15 minutes per client on the API, 10 failed logins per 15 minutes.
- **Hardening.** Helmet headers, strict CORS origin, upload limit of 1 MB (`.csv` and `.json` only), bcrypt password hashing.
- **Secrets.** `.env` files are git-ignored. Only `.env.example` is committed.

---

## 12. Testing

```bash
cd backend
npm test            # Jest + Supertest on an in-memory MongoDB (no setup needed)
npm run lint

cd ../frontend
npm run lint
npm run build
```

Backend suites cover authentication, attempts, scoring, admin operations, student reports, demo seeding and email. To test email without real SMTP, run `npm test -- email` (mocked transporter).

> The first test run downloads a MongoDB binary for `mongodb-memory-server`, so it needs an internet connection once.

---

## 13. Bulk Import and Export

Admins can import **students** and **questions** from `.csv` or `.json` files (max 1 MB) from the Admin panel or via the API.

```bash
# Log in as admin and save the cookie
curl -c cookies.txt -X POST http://localhost:5000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"identifier":"admin","password":"Admin000"}'

# Download an import template
curl -b cookies.txt http://localhost:5000/admin/import-templates/questions
```

Exports of students, questions and attempts (including tab-switch counts) are available under `/admin/export/*`.

---

## 14. Customisation

| What | Where |
| --- | --- |
| Allowed classes (e.g. `TYCS Sem V`) | `GRADE_OPTIONS` in `backend/src/utils/constants.js` |
| Pass percentage (default 20%) | `PASS_PERCENTAGE` in the same file |
| Rate limits | `RATE_LIMITS` in the same file |
| Default tab-switch limit (3) and attempts per test (1) | `MAX_TAB_SWITCHES_DEFAULT`, `MAX_ATTEMPTS_DEFAULT` |
| Weak-topic threshold | `WEAK_TOPIC_RATIO`, `MAX_WEAK_TOPICS` |

Existing students whose stored grade no longer matches the list can be found with `node scripts/auditGrades.js`.

---

## 15. Known Limitations

These are real constraints of the current build.

### Adaptive difficulty is rule-based
The difficulty band (`easy` / `medium` / `hard`) is chosen **once**, when an attempt starts, from the student's historical average in that subject. It is not re-evaluated mid-test. If the chosen band lacks enough questions, the system **falls back to the whole pool**, so a band label is only nominal. Students with no history are placed in `medium`.

### Email is optional and best-effort
Disabled by default. When enabled it sends welcome, result and streak-reminder emails. Delivery is fire-and-forget: failures are logged and swallowed, there is no retry queue, and users without an email address are skipped. Each result email is recorded on the attempt (`result.emailSentAt`) so it is never sent twice. Enabling email without `EMAIL_USER` and `EMAIL_PASS` turns it off again with a warning.

### Proctoring is lightweight
- A **tab switch** is counted from the browser `visibilitychange` event. New tests default to a limit of **3**. When the count reaches the limit, the attempt is **auto-submitted**. Setting `maxTabSwitches` to `0` makes it detection-only.
- There is **no** webcam or face detection, fullscreen enforcement, copy/paste blocking or network monitoring.
- Tab-switch events are reported by the client, so anyone comfortable with browser dev tools can bypass them. The **server-side deadline** is the only strongly enforced anti-cheating measure.

---

## 16. Troubleshooting

| Problem | Fix |
| --- | --- |
| `[env] Invalid environment configuration` on start | Copy `.env.example` to `.env` and fix the listed variables (`JWT_SECRET` must be 16+ characters) |
| Cannot connect to MongoDB | Check `MONGO_URI`, that MongoDB is running, and that your IP is allowed in Atlas |
| Login works but session is lost | Make sure `CLIENT_ORIGIN` exactly matches the frontend URL. For cross-domain deployments use `COOKIE_SAMESITE=none` with HTTPS |
| CORS errors in the browser | `CLIENT_ORIGIN` must be an exact origin without a trailing slash |
| Frontend cannot reach the API | Check `VITE_API_URL` in `frontend/.env` and restart `npm run dev` |
| Gmail email fails | Use a Google **App Password** with 2-Step Verification, not your account password |
| Duplicate-email index error on an old database | Run `node scripts/fixEmailIndex.js` |
| Seeding says data already exists | Seeding is idempotent. Existing questions, tests and accounts are skipped |

---

LearnPrep · Built with the MERN stack
