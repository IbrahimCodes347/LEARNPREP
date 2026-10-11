# LearnPrep

MERN exam-preparation platform: timed tests with server-side scoring, negative
marking, tab-switch *reporting*, leaderboards, weak-topic analytics and PDF
result reports. See [Known limitations](#known-limitations) before relying on
adaptive difficulty, email or proctoring.

- `backend/` - Node + Express + MongoDB (ESM)
- `frontend/` - React 18 + Vite + Tailwind/daisyUI
- `docs/` - product, architecture, design, security and phase specs

## Prerequisites

- Node 18+
- A MongoDB Atlas cluster (or any reachable MongoDB)

## Setup

### 1. Server

```bash
cd backend
npm install
cp .env.example .env      # then edit .env
```

`.env` must set:

| Variable | Purpose |
| --- | --- |
| `MONGO_URI` | MongoDB connection string. The database name must be `learnprep` - e.g. `mongodb://127.0.0.1:27017/learnprep` |
| `JWT_SECRET` | Signing key - generate a long random value |
| `CLIENT_ORIGIN` | Comma-separated allowed origins |
| `PORT` | Defaults to `5000` |

Generate a secret with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

### 2. Seed demo data

```bash
cd backend
npm run seed
```

Creates the question bank, three tests, and two accounts:

| Role | Username | Password |
| --- | --- | --- |
| Admin | `admin` | `Admin000` |
| Student | `student` | `Student@123` |

Admins can only be created by the seed script - there is no admin signup route.

### 3. Run

```bash
cd backend
npm run dev        # API on http://localhost:5000
```

```bash
cd frontend
npm install
npm run dev        # UI on http://localhost:5173
```

The client talks to the API on the origin given by `VITE_API_URL` (default
`http://localhost:5000`), so API paths can never shadow page routes. Only
`/socket.io` is proxied in development. The server sends CORS credentials, so the
cookie session works across the two dev ports.

## Tests

```bash
cd backend
npm test            # jest against an in-memory MongoDB
npm run lint
```

```bash
cd frontend
npm run lint
npm run build
```

## Common tasks

```bash
# Export a data template for bulk import (admin only)
curl -c cookies.txt -X POST http://localhost:5000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"identifier":"admin","password":"Admin000"}'
curl -b cookies.txt http://localhost:5000/admin/import-templates/questions

# Check the users.email index (read-only by default).
# Only needed for a database created before the schema switched to a partial
# unique index; a fresh database builds the correct index on first server start.
cd backend && node scripts/fixEmailIndex.js
```

## Notes

- Scoring is entirely server-side. The test-start payload contains question text,
  options and marks but never `correctIndex` or `explanation`; those appear only
  after submission.
- Attempt deadlines are enforced server-side, and an in-progress attempt is
  resumed (not duplicated) when a test is started again.
- `GET /attempts/mine` accepts `status` and `testId` query filters.

## Known limitations

These are real constraints of the current build, not future work.

### Adaptive difficulty is rule-based, not adaptive within a test

The band (`easy` / `medium` / `hard`) is chosen **once**, at attempt start, from
the student's historical average percentage in that subject
(`services/adaptiveService.js`). There is no mid-test re-evaluation - a student
who is struggling is not moved to easier questions.

If the chosen band does not contain enough questions, the filter **silently
falls back to the whole pool**, so an attempt labelled `easy` can still contain
hard questions. Attempt questions are therefore only *nominally* band-matched.

A student with no prior history in the subject is always placed in `medium`.

### Email is optional, best-effort, and never blocks a submit

Disabled by default (`EMAIL_ENABLED=false`). When enabled it sends **three kinds of
emails** - a **result** report after each submitted test (score, break-up, weak
topics, rank), a **welcome** email on registration, and a daily **streak
reminder** for students who missed yesterday (`backend/src/jobs/streakCron.js`).

Delivery is fire-and-forget. A user with no email address on file is skipped
without a warning, and any failure (bad credentials, network, full mailbox) is
logged and swallowed by `emailService`. Each result email is logged on the
attempt (`result.emailSentAt`), so the same attempt is never emailed twice even
if a cron race or double submit occurs. There is no retry queue, so a "sent"
result email is not proof of delivery.

Defaults target Gmail (`smtp.gmail.com:587`, STARTTLS) so only `EMAIL_USER` and
`EMAIL_PASS` are needed, and `EMAIL_HOST`/`EMAIL_PORT`/`EMAIL_SECURE`/`EMAIL_FROM`
override the defaults for other providers. Gmail requires an app password, not
the account password.

Enabling `EMAIL_ENABLED=true` without `EMAIL_USER`/`EMAIL_PASS` disables email
again and logs a warning.

Testing:
- **Without a real SMTP:** `cd backend && npm test -- email` (mocked transporter).
- **Against real Gmail:** see `` (2-Step Verification → app
  password → `npm run test:email -- --to you@gmail.com`).

### Proctoring reports tab switches; it does not enforce anything

Proctoring consists of a `tabSwitchCount` (incremented on the browser
`visibilitychange` event) and an `autoSubmitted` flag set when the server-side
deadline passes.

- Tab switches are **advisory only**. They never change the score, never deduct
  marks, and never trigger an automatic submission. They are shown to admins in
  the attempt log and included in the CSV export.
- There is **no** webcam or face detection, no fullscreen enforcement, no
  copy/paste or right-click blocking, and no network monitoring. The events are
  reported by the browser and sent to the server by the client, so they are
  trivially bypassed by anyone comfortable with devtools.
- Deadline enforcement *is* server-side and is the only genuinely enforced
  anti-cheating measure: closing the tab or losing connectivity does not extend
  the attempt.
