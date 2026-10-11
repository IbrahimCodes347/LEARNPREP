import mongoose from 'mongoose';
import ApiError from './ApiError.js';

const HEX24 = /^[a-f\d]{24}$/i;

/**
 * Accepts a hex string, an ObjectId, or a document carrying an `_id`. Service
 * calls pass real instances, so string-only checks would wrongly reject them.
 * ObjectId._id is self-referential, hence the guard against infinite unwrap.
 */
export const isValidObjectId = (value) => {
  if (typeof value === 'string') return HEX24.test(value);
  if (value === null || typeof value !== 'object') return false;
  if (value._id !== undefined && value._id !== value) return isValidObjectId(value._id);
  return HEX24.test(String(value));
};

/**
 * Casts to an ObjectId for use inside aggregation pipelines. `aggregate()`
 * forwards raw values to the server unlike `find()`, so a hex string would
 * silently match nothing instead of erroring. Returns null for empty values.
 */
export const toObjectId = (value, field = 'id') => {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof mongoose.Types.ObjectId) return value;
  if (!isValidObjectId(value)) throw ApiError.badRequest(`Invalid ${field}`);
  return new mongoose.Types.ObjectId(String(value));
};

export function shuffle(array) {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function sample(array, count) {
  return shuffle(array).slice(0, Math.max(0, count));
}

export function round2(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function dayKey(date) {
  return new Date(date).toISOString().slice(0, 10);
}

export default { isValidObjectId, toObjectId, shuffle, sample, round2, dayKey };
