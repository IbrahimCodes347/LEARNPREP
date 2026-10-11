import { Question } from '../models/Question.js';
import { ADAPTIVE_BANDS } from '../utils/constants.js';
import { toObjectId } from '../utils/id.js';

export function pickBand(avgPercentInSubject, { hasHistory = false } = {}) {
  if (!hasHistory || avgPercentInSubject === null || avgPercentInSubject === undefined) return 'medium';
  const pct = Number(avgPercentInSubject);
  if (!Number.isFinite(pct)) return 'medium';
  if (pct < 40) return 'easy';
  if (pct <= 70) return 'medium';
  return 'hard';
}

/**
 * Filters the fixed test pool down to the chosen band. Falls back to the whole
 * pool when the pool does not contain enough questions in the band.
 */
export function filterPoolForBand(pool, band, count) {
  if (!ADAPTIVE_BANDS.includes(band)) return pool;
  const inBand = pool.filter((q) => q?.difficulty === band);
  return inBand.length >= count ? inBand : pool;
}

export async function averagePercentInSubject(userId, subject) {
  const Attempt = (await import('../models/Attempt.js')).Attempt;
  // aggregate() does not cast pipeline values, so a string userId matches nothing.
  const userOid = toObjectId(userId, 'user id');
  const rows = await Attempt.aggregate([
    { $match: { userId: userOid, status: 'submitted' } },
    { $lookup: { from: 'tests', localField: 'testId', foreignField: '_id', as: 'test' } },
    { $unwind: '$test' },
    { $match: { 'test.subject': subject } },
    { $group: { _id: null, avg: { $avg: '$result.percentage' }, n: { $sum: 1 } } }
  ]);
  if (!rows.length) return { average: null, attempts: 0 };
  return { average: rows[0].avg, attempts: rows[0].n };
}

/** Loads full question documents for a pool of ids (needed for scoring). */
export function loadQuestions(ids) {
  if (!Array.isArray(ids) || ids.length === 0) return [];
  return Question.find({ _id: { $in: ids }, isDeleted: false }).lean();
}

export default { pickBand, filterPoolForBand, averagePercentInSubject, loadQuestions };
