import mongoose from 'mongoose';
import { DIFFICULTIES } from '../utils/constants.js';

const { Schema, model } = mongoose;

const questionSchema = new Schema(
  {
    subject: { type: String, required: [true, 'Subject is required'], trim: true, maxlength: 80 },
    topic: { type: String, required: [true, 'Topic is required'], trim: true, maxlength: 80 },
    difficulty: { type: String, enum: DIFFICULTIES, required: true, default: 'medium' },
    questionText: {
      type: String,
      required: [true, 'Question text is required'],
      trim: true,
      maxlength: 2000
    },
    options: {
      type: [String],
      required: true,
      validate: [(v) => Array.isArray(v) && v.length >= 2, 'At least 2 options are required'],
      validateOptionsLength: {
        validator: (v) => Array.isArray(v) && v.every((o) => typeof o === 'string' && o.trim().length > 0),
        message: 'Options must be non-empty strings'
      }
    },
    correctIndex: {
      type: Number,
      required: true,
      min: 0,
      validate: {
        validator: function validateIndex(value) {
          return Number.isInteger(value) && Array.isArray(this.options) && value < this.options.length;
        },
        message: 'correctIndex is out of range for the given options'
      }
    },
    marks: { type: Number, default: 1, min: 0, max: 100 },
    explanation: { type: String, trim: true, default: '', maxlength: 2000 },
    isDeleted: { type: Boolean, default: false },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null }
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

questionSchema.index({ subject: 1, topic: 1, difficulty: 1 });
questionSchema.index({ isDeleted: 1 });

export const Question = model('Question', questionSchema);
export default Question;
