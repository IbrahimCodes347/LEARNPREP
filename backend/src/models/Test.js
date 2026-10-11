import mongoose from 'mongoose';
import { MAX_ATTEMPTS_DEFAULT, MAX_TAB_SWITCHES_DEFAULT, TEST_STATUS, DIFFICULTIES } from '../utils/constants.js';

const { Schema, model } = mongoose;

const testSchema = new Schema(
  {
    title: { type: String, required: [true, 'Title is required'], trim: true, maxlength: 140 },
    subject: {
      type: String,
      required: [true, 'Subject is required'],
      trim: true,
      maxlength: 80,
      index: true
    },
    description: { type: String, trim: true, default: '', maxlength: 500 },
    durationMinutes: { type: Number, required: true, min: 1, max: 600 },
    questionIds: [{ type: Schema.Types.ObjectId, ref: 'Question' }],
    topics: { type: [String], default: [] },
    difficultyFilter: { type: [String], enum: DIFFICULTIES, default: [] },
    totalMarks: { type: Number, default: 0, min: 0 },
    negativeMarks: { type: Number, default: 0, min: 0, max: 100 },
    passMarks: { type: Number, default: null, min: 0 },
    shuffle: { type: Boolean, default: true },
    isAdaptive: { type: Boolean, default: false },
    maxTabSwitches: { type: Number, default: MAX_TAB_SWITCHES_DEFAULT, min: 0, max: 50 },
    // 0 = unlimited; per-user admin grants are added to this total in startAttempt.
    maxAttempts: { type: Number, default: MAX_ATTEMPTS_DEFAULT, min: 0, max: 20 },
    // userId -> number of extra attempts granted by an admin for this test.
    extraAttempts: { type: Map, of: Number, default: () => ({}) },
    status: {
      type: String,
      enum: Object.values(TEST_STATUS),
      default: TEST_STATUS.DRAFT,
      index: true
    },
    activeFrom: { type: Date, default: null },
    activeUntil: { type: Date, default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null }
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

testSchema.index({ status: 1, activeFrom: 1, activeUntil: 1 });

testSchema.virtual('questionCount').get(function questionCount() {
  return Array.isArray(this.questionIds) ? this.questionIds.length : 0;
});

testSchema.methods.isOpenAt = function isOpenAt(date = new Date()) {
  if (this.status !== TEST_STATUS.ACTIVE) return false;
  if (this.activeFrom && date < this.activeFrom) return false;
  if (this.activeUntil && date > this.activeUntil) return false;
  return true;
};

export const Test = model('Test', testSchema);
export default Test;
