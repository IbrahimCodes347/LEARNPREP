import { Attempt } from '../models/Attempt.js';
import { ROLES, TEST_STATUS } from '../utils/constants.js';
import { toObjectId } from '../utils/id.js';

export function isOpenAt(test, now = new Date()) {
  if (test.status !== TEST_STATUS.ACTIVE) return false;
  if (test.activeFrom && now < new Date(test.activeFrom)) return false;
  if (test.activeUntil && now > new Date(test.activeUntil)) return false;
  return true;
}

/**
 * Best (highest percentage, then earliest submission) submitted attempt per
 * student. Computed by aggregation so it can never drift out of sync.
 */
export async function getLeaderboard({ testId, viewerId, limit = 100 }) {
  // Callers may hand us a hex string (e.g. straight from route params) and
  // aggregate() does not cast, so $match would silently return nothing.
  const testOid = toObjectId(testId, 'test id');
  const rows = await Attempt.aggregate([
    { $match: { testId: testOid, status: 'submitted' } },
    { $sort: { 'result.percentage': -1, submittedAt: 1 } },
    {
      $group: {
        _id: '$userId',
        best: { $first: '$$ROOT' }
      }
    },
    { $sort: { 'best.result.percentage': -1, 'best.submittedAt': 1 } },
    { $limit: limit },
    {
      $lookup: {
        from: 'users',
        localField: '_id',
        foreignField: '_id',
        as: 'user'
      }
    },
    { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: 0,
        userId: { $toString: '$_id' },
        name: { $ifNull: ['$user.name', 'Unknown'] },
        grade: { $ifNull: ['$user.grade', null] },
        score: '$best.result.score',
        totalMarks: '$best.result.totalMarks',
        percentage: '$best.result.percentage',
        passed: '$best.result.passed',
        submittedAt: '$best.submittedAt',
        autoSubmitted: '$best.autoSubmitted',
        attemptId: { $toString: '$best._id' },
        durationSec: {
          $max: [0, { $divide: [{ $subtract: ['$best.submittedAt', '$best.startedAt'] }, 1000] }]
        }
      }
    }
  ]);

  const entries = rows.map((row, index) => ({
    ...row,
    rank: index + 1,
    timeSec: Math.round(row.durationSec ?? 0),
    isMe: String(row.userId) === String(viewerId ?? '')
  }));

  const me = entries.find((e) => e.isMe);
  return {
    entries,
    totalParticipants: entries.length,
    myRank: me?.rank ?? null
  };
}

/** Test ids the user is allowed to join/observe on the leaderboard socket. */
export async function canJoinTest({ user, testId }) {
  if (user.role === ROLES.ADMIN) return true;
  const attempt = await Attempt.findOne({ userId: user._id, testId, status: 'submitted' })
    .select('_id')
    .lean();
  return Boolean(attempt);
}

export default { getLeaderboard, canJoinTest, isOpenAt };
