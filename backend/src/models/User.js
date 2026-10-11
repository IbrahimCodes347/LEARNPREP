import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { ROLES } from '../utils/constants.js';

const { Schema, model } = mongoose;

const SALT_ROUNDS = 10;

/**
 * Optional identifiers that must be *absent* rather than null/'' when blank.
 * Shared by every write path (self register, admin create, CSV bulk import).
 */
const OPTIONAL_IDENTIFIERS = ['username', 'email', 'rollno'];

const streakSchema = new Schema(
  {
    count: { type: Number, default: 0, min: 0 },
    lastActiveDate: { type: String, default: null }
  },
  { _id: false }
);

const userSchema = new Schema(
  {
    name: { type: String, required: [true, 'Name is required'], trim: true, maxlength: 80 },
    username: {
      type: String,
      trim: true,
      lowercase: true,
      minlength: 3,
      maxlength: 40,
      index: { unique: true, partialFilterExpression: { username: { $type: 'string' } } }
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      maxlength: 120,
      index: { unique: true, partialFilterExpression: { email: { $type: 'string' } } }
    },
    rollno: {
      type: String,
      trim: true,
      uppercase: true,
      maxlength: 30,
      index: { unique: true, partialFilterExpression: { rollno: { $type: 'string' } } }
    },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: Object.values(ROLES), default: ROLES.STUDENT, index: true },
    grade: { type: String, trim: true, default: 'TYCS Sem V', maxlength: 40, index: true },
    isActive: { type: Boolean, default: true, index: true },
    isDeleted: { type: Boolean, default: false, index: true },
    streak: { type: streakSchema, default: () => ({}) },
    reminderSentOn: { type: String, default: null }, // 'YYYY-MM-DD' - last streak reminder day
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null }
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

userSchema.virtual('isAdmin').get(function isAdmin() {
  return this.role === ROLES.ADMIN;
});

/**
 * Drop blank optional identifiers so they are never saved as null or ''.
 * The unique indexes are partial on `{ field: { $type: 'string' } }`, so a saved
 * null would still be indexed and the second blank value would collide (E11000).
 * On the model so admin create, self register and CSV import all behave the same.
 */
userSchema.pre('validate', function dropBlankIdentifiers(next) {
  for (const field of OPTIONAL_IDENTIFIERS) {
    const value = this[field];
    if (value === undefined) continue; // already absent
    if (value === null || (typeof value === 'string' && value.trim() === '')) {
      this.set(field, undefined);
    }
  }
  next();
});

userSchema.methods.setPassword = async function setPassword(plain) {
  this.passwordHash = await bcrypt.hash(plain, SALT_ROUNDS);
  return this;
};

userSchema.methods.verifyPassword = function verifyPassword(plain) {
  if (!this.passwordHash) return Promise.resolve(false);
  return bcrypt.compare(plain, this.passwordHash);
};

userSchema.methods.toPublic = function toPublic() {
  const obj = this.toObject({ virtuals: true });
  delete obj.passwordHash;
  delete obj.__v;
  return obj;
};

export const User = model('User', userSchema);
export default User;
