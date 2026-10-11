import mongoose from 'mongoose';
import { ATTEMPT_STATUS, PROCTOR_EVENTS } from '../utils/constants.js';

const { Schema, model } = mongoose;

const responseSchema = new Schema(
  {
    questionId: { type: Schema.Types.ObjectId, ref: 'Question', required: true },
    selectedIndex: { type: Number, default: null },
    timeSpentSec: { type: Number, default: 0, min: 0 },
    savedAt: { type: Date, default: Date.now }
  },
  { _id: false }
);

const eventSchema = new Schema(
  {
    type: { type: String, enum: Object.values(PROCTOR_EVENTS), required: true },
    at: { type: Date, default: Date.now }
  },
  { _id: false }
);

const resultSchema = new Schema(
  {
    score: { type: Number, default: 0 },
    totalMarks: { type: Number, default: 0 },
    percentage: { type: Number, default: 0 },
    correct: { type: Number, default: 0 },
    wrong: { type: Number, default: 0 },
    unattempted: { type: Number, default: 0 },
    weakTopics: { type: [String], default: [] },
    passed: { type: Boolean, default: null },
    band: { type: String, default: null },
    emailSentAt: { type: Date, default: null },
    detail: [
      {
        questionId: { type: Schema.Types.ObjectId, ref: 'Question' },
        selectedIndex: { type: Number, default: null },
        correctIndex: { type: Number, default: null },
        isCorrect: { type: Boolean, default: false },
        marks: { type: Number, default: 0 },
        topic: { type: String, default: '' },
        awarded: { type: Number, default: 0 }
      }
    ]
  },
  { _id: false }
);

const attemptSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    testId: { type: Schema.Types.ObjectId, ref: 'Test', required: true },
    status: {
      type: String,
      enum: Object.values(ATTEMPT_STATUS),
      default: ATTEMPT_STATUS.IN_PROGRESS,
      index: true
    },
    startedAt: { type: Date, default: Date.now },
    deadlineAt: { type: Date, required: true, index: true },
    submittedAt: { type: Date, default: null },
    autoSubmitted: { type: Boolean, default: false },
    autoSubmitReason: { type: String, default: null },
    questionOrder: [{ type: Schema.Types.ObjectId, ref: 'Question' }],
    responses: { type: [responseSchema], default: [] },
    tabSwitchCount: { type: Number, default: 0 },
    events: { type: [eventSchema], default: [] },
    result: { type: resultSchema, default: () => ({}) }
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

// One in-progress attempt per (user, test) - race-safe duplicate prevention.
attemptSchema.index(
  { userId: 1, testId: 1 },
  {
    unique: true,
    partialFilterExpression: { status: ATTEMPT_STATUS.IN_PROGRESS },
    name: 'uniq_in_progress_attempt'
  }
);
attemptSchema.index({ testId: 1, status: 1 });
attemptSchema.index({ userId: 1, status: 1 });
attemptSchema.index({ deadlineAt: 1, status: 1 });

attemptSchema.virtual('answeredCount').get(function answeredCount() {
  return (this.responses || []).filter((r) => r.selectedIndex !== null && r.selectedIndex !== undefined)
    .length;
});

export const Attempt = model('Attempt', attemptSchema);
export default Attempt;
