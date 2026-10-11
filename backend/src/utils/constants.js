export const ROLES = Object.freeze({ STUDENT: 'student', ADMIN: 'admin' });

export const TEST_STATUS = Object.freeze({
  DRAFT: 'draft',
  ACTIVE: 'active',
  INACTIVE: 'inactive'
});

export const ATTEMPT_STATUS = Object.freeze({
  IN_PROGRESS: 'in_progress',
  SUBMITTED: 'submitted'
});

export const DIFFICULTIES = Object.freeze(['easy', 'medium', 'hard']);

export const ADAPTIVE_BANDS = Object.freeze(['easy', 'medium', 'hard']);

export const PROCTOR_EVENTS = Object.freeze({ TAB_SWITCH: 'tab_switch' });

/** Default cap for new tests; 0 on a stored test means "detection only". */
export const MAX_TAB_SWITCHES_DEFAULT = 3;
/** Collapses the double event a browser fires when both visibilitychange and blur fire. */
export const TAB_SWITCH_DEDUPE_MS = 1000;

/** Attempts allowed per test for new tests; 0 on a stored test means unlimited. */
export const MAX_ATTEMPTS_DEFAULT = 1;

export const AUTO_SUBMIT_REASONS = Object.freeze({ TAB_SWITCH_LIMIT: 'tab_switch_limit' });

export const COOKIE_NAME = 'lp_token';

export const GRACE_SECONDS = 5;

export const WEAK_TOPIC_RATIO = 0.5;
export const MAX_WEAK_TOPICS = 5;

export const AUTO_SUBMIT_BATCH = 100;
export const MAX_UPLOAD_BYTES = 1024 * 1024;
export const ALLOWED_UPLOAD_EXTENSIONS = Object.freeze(['.csv', '.json']);

export const RATE_LIMITS = Object.freeze({
  LOGIN_MAX: 10,
  API_MAX: 300,
  WINDOW_MINUTES: 15
});

export const SCORE = Object.freeze({ MIN: 0 });

/**
 * Fixed pass bar for the grade report: a student passes when the AVERAGE of
 * their submitted result percentages is >= PASS_PERCENTAGE. Single source of
 * truth, echoed back in every report response so the frontend never hardcodes.
 */
export const PASS_PERCENTAGE = 20;

/**
 * Allowed classes, EDIT ME. Every grade input across the app (admin create/edit,
 * self-register, CSV bulk import) is validated against this list,
 * case-insensitively with whitespace collapsed. Legacy values already stored
 * that do not match keep working but are flagged by scripts/auditGrades.js.
 */
export const GRADE_OPTIONS = Object.freeze(['SYCS Sem III', 'TYCS Sem IV', 'TYCS Sem V']);

/** Lower-cased canonical classes for fast lookups (same order as GRADE_OPTIONS). */
export const GRADE_OPTIONS_LOWER = Object.freeze(GRADE_OPTIONS.map((g) => g.toLowerCase()));

/** Label for students whose grade is blank/whitespace/missing. */
export const UNASSIGNED_GRADE = 'Unassigned';

/**
 * Normalise one stored grade to its canonical spelling: trim, collapse internal
 * whitespace, then match case-insensitively against GRADE_OPTIONS. Blank
 * becomes null (-> "Unassigned" when grouped); anything unmatched is kept
 * as-is so the audit script can surface it instead of hiding it.
 */
export function normalizeGrade(value) {
  const collapsed = String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ');
  if (collapsed === '') return null;
  const idx = GRADE_OPTIONS_LOWER.indexOf(collapsed.toLowerCase());
  return idx !== -1 ? GRADE_OPTIONS[idx] : collapsed;
}

/**
 * The same normalisation as an aggregation expression, used by every pipeline
 * that must group or compare grades (grade report, class roll-up, toppers,
 * admin student list). `field` is the path to the stored grade, defaulting to
 * `$user.grade` because report pipelines look up the user first.
 */
export function gradeNormalizeExpr(field = '$$user.grade') {
  return {
    $let: {
      vars: {
        collapsed: {
          $reduce: {
            input: {
              $filter: {
                input: { $split: [{ $trim: { input: { $ifNull: [field, ''] } } }, ' '] },
                as: 'part',
                cond: { $ne: ['$$part', ''] }
              }
            },
            initialValue: '',
            in: {
              $cond: [{ $eq: ['$$value', ''] }, '$$this', { $concat: ['$$value', ' ', '$$this'] }]
            }
          }
        }
      },
      in: {
        $switch: {
          branches: GRADE_OPTIONS.map((g) => ({
            case: { $eq: [{ $toLower: '$$collapsed' }, g.toLowerCase()] },
            then: g
          })),
          default: { $cond: [{ $eq: ['$$collapsed', ''] }, UNASSIGNED_GRADE, '$$collapsed'] }
        }
      }
    }
  };
}

/**
 * The only grade groups a report may show: the canonical classes plus the
 * blank/Unassigned bucket. Any stored grade that normalises to something else
 * is a legacy value ("t", "tycs", "12", ...) and is filtered out of every grade
 * report so it never forms a bucket. scripts/auditGrades.js still lists those
 * values so an admin can clean them up.
 */
export const REPORTABLE_GRADES = Object.freeze([...GRADE_OPTIONS, UNASSIGNED_GRADE]);

/**
 * $expr predicate for an aggregate() $match: true only while `field` normalises
 * to a REPORTABLE_GRADES value. The single place the report-exclusion rule lives;
 * every grade pipeline (class roll-up, dropdown, toppers) reuses it.
 */
export function gradeReportableExpr(field = '$$user.grade') {
  return { $in: [gradeNormalizeExpr(field), REPORTABLE_GRADES] };
}

export const RECOMMENDATION_LEVELS = Object.freeze({
  ATTENTION: 'attention',
  WATCH: 'watch',
  ON_TRACK: 'on_track'
});

/**
 * Recommendation level for one student, computed from the same numbers that
 * decide pass/fail. Rules (documented once, mirrored in docs/Rules.md):
 *  attention - average < PASS_PERCENTAGE, OR the last 3 results strictly decline
 *  watch     - average < PASS_PERCENTAGE + 10, OR fewer than 2 attempts
 *  on_track  - otherwise
 */
export function recommendationLevel({ avgPercentage, attemptsCount, percentages = [] }) {
  const last3 = percentages.slice(-3);
  const strictlyDeclining =
    last3.length >= 3 && last3.every((v, i) => i === 0 || v < last3[i - 1]);
  if (avgPercentage < PASS_PERCENTAGE || strictlyDeclining) return RECOMMENDATION_LEVELS.ATTENTION;
  if (avgPercentage < PASS_PERCENTAGE + 10 || attemptsCount < 2) return RECOMMENDATION_LEVELS.WATCH;
  return RECOMMENDATION_LEVELS.ON_TRACK;
}

/**
 * One-sentence recommendation message, built from the level plus the student's
 * weakest topics. Placed next to the rule so both stay in one file.
 */
export function recommendationMessage(level, { avgPercentage, percentages = [], weakTopics = [] }) {
  const fmt = (v) => `${Number(v).toFixed(2)}%`;
  const last3 = percentages.slice(-3);
  const declining =
    last3.length >= 3 && last3.every((v, i) => i === 0 || v < last3[i - 1]);
  let text;
  if (level === RECOMMENDATION_LEVELS.ATTENTION) {
    text = declining
      ? 'The last 3 results strictly declined.'
      : `Average ${fmt(avgPercentage)} is below the ${PASS_PERCENTAGE}% pass mark.`;
  } else if (level === RECOMMENDATION_LEVELS.WATCH) {
    text =
      avgPercentage < PASS_PERCENTAGE + 10
        ? `Average ${fmt(avgPercentage)} is close to the ${PASS_PERCENTAGE}% pass mark.`
        : 'Take another test so the pass decision has a clearer shape.';
  } else {
    text = `Average ${fmt(avgPercentage)} is above the ${PASS_PERCENTAGE}% pass mark.`;
  }
  return weakTopics.length ? `${text} Weak areas: ${weakTopics.join(', ')}.` : text;
}
