import mongoose from 'mongoose';

const { Schema, model } = mongoose;

const bookmarkSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    questionId: { type: Schema.Types.ObjectId, ref: 'Question', required: true, index: true },
    note: { type: String, trim: true, default: '', maxlength: 500 }
  },
  { timestamps: true }
);

bookmarkSchema.index({ userId: 1, questionId: 1 }, { unique: true });

export const Bookmark = model('Bookmark', bookmarkSchema);
export default Bookmark;
