import { pathToFileURL } from 'url';
import { connectDb, disconnectDb } from '../src/config/db.js';
import { User } from '../src/models/User.js';
import { GRADE_OPTIONS, normalizeGrade } from '../src/utils/constants.js';
import { createLogger } from '../src/utils/logger.js';

const log = createLogger('audit-grades');

/**
 * EDIT ME, STEP 3 grade cleanup. Dry-run is the default; nothing is written
 * until the script is run with `--apply --confirm`.
 *
 * GRADE_MAP     exact stored grade (matched case-insensitively on the collapsed
 *               single-space text) -> the grade to store instead.
 * REMOVE_USERS  usernames to soft-delete with the app's own behaviour
 *               (isDeleted=true, isActive=false, like DELETE /admin/students).
 *               Attempts, results and bookmarks are kept.
 */
const GRADE_MAP = {
  tycs: 'TYCS Sem V'
};
const REMOVE_USERS = ['demo_0'];

/** Collapse whitespace the same way the report normalisation does. */
function collapse(value) {
  return String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ');
}

/** Junk = non-blank and not a case/space variant of a canonical option. */
function isOutsideOptions(value) {
  const collapsed = collapse(value);
  if (collapsed === '') return false;
  if (normalizeGrade(collapsed) !== collapsed) return false;
  return !GRADE_OPTIONS.includes(collapsed);
}

function show(value) {
  const collapsed = collapse(value);
  return collapsed === '' ? '(blank)' : `"${collapsed}"`;
}

/** Identify a user even when they never had a username stored (test/seed rows). */
function userLabel(u) {
  const uname = u.username ? u.username : '(no username)';
  const extra = [];
  if (u.rollno) extra.push(`rollno ${u.rollno}`);
  if (!u.username) extra.push(`id ${String(u._id)}`);
  const tail = extra.length ? ` - ${extra.join(', ')}` : '';
  return `${uname} (${u.name}) [${u.role}]${tail}`;
}

/** Split every user into: re-map, soft-delete, or still-outside-the-allowlist. */
function buildPlan(userDocs) {
  const removeSet = new Set(REMOVE_USERS.map((u) => String(u).toLowerCase()));
  const plan = { remaps: [], removals: [], outside: [] };

  for (const u of userDocs) {
    if (u.username && removeSet.has(String(u.username).toLowerCase())) {
      plan.removals.push(u);
      continue;
    }
    const collapsed = collapse(u.grade);
    const key = collapsed.toLowerCase();
    if (Object.hasOwn(GRADE_MAP, key)) {
      plan.remaps.push({ user: u, from: collapsed, to: GRADE_MAP[key] });
      continue;
    }
    if (isOutsideOptions(u.grade)) plan.outside.push(u);
  }

  return plan;
}

function printPlan({ remaps, removals, outside }) {
  log.info('=== Grade cleanup (dry-run) ===');

  log.info(`Re-map via GRADE_MAP (${remaps.length}):`);
  if (remaps.length === 0) log.info('  none');
  for (const r of remaps) {
    log.info(`  ${userLabel(r.user)}: ${show(r.from)} -> ${show(r.to)}`);
  }

  log.info(`Remove via REMOVE_USERS, soft-delete (${removals.length}):`);
  if (removals.length === 0) log.info('  none');
  for (const u of removals) {
    log.info(`  ${userLabel(u)}`);
  }

  log.info(`Still outside GRADE_OPTIONS after cleanup (${outside.length}):`);
  if (outside.length === 0) log.info('  none');
  for (const u of outside) {
    log.info(`  ${userLabel(u)}: ${show(u.grade)}`);
  }
}

async function applyPlan({ remaps, removals }) {
  log.warn('Back up the database first (Atlas export or a Compass snapshot): this writes to the live data.');

  let remapped = 0;
  for (const r of remaps) {
    await User.updateOne({ _id: r.user._id }, { $set: { grade: r.to } });
    remapped += 1;
  }

  let removed = 0;
  for (const u of removals) {
    await User.updateOne({ _id: u._id }, { $set: { isDeleted: true, isActive: false } });
    removed += 1;
  }

  log.info(`Re-mapped ${remapped} user(s); soft-deleted ${removed} user(s).`);
  log.info('No users, attempts, results or bookmarks were hard-deleted.');
}

async function run() {
  const hasApply = process.argv.includes('--apply');
  const hasConfirm = process.argv.includes('--confirm');
  if (hasApply && !hasConfirm) {
    log.error('--apply requires the confirmation flag: node scripts/auditGrades.js --apply --confirm');
    process.exit(1);
  }

  const userDocs = await User.find(
    {},
    { _id: 1, name: 1, username: 1, rollno: 1, role: 1, grade: 1 }
  ).lean();

  const plan = buildPlan(userDocs);
  printPlan(plan);
  if (hasApply && hasConfirm) await applyPlan(plan);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  connectDb()
    .then(run)
    .then(async () => {
      await disconnectDb();
      process.exit(0);
    })
    .catch((err) => {
      log.error('audit failed:', err.message);
      process.exit(1);
    });
}

export default run;
