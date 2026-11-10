import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Invalid email address'],
    },
    passwordHash: {
      type: String,
      required: [true, 'Password hash is required'],
      select: false, // never returned in queries by default
    },
    profileImage: {
      type: String,
      default: null,
    },
    role: {
      type: String,
      enum: ['shopkeeper', 'admin'],
      default: 'shopkeeper',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    // Convenience flag: set to false once the user completes shop onboarding
    hasCompletedOnboarding: {
      type: Boolean,
      default: false,
    },
    primaryLanguage: {
      type: String,
      enum: ['hi', 'hinglish', 'kn', 'en'],
      default: 'hi',
    },
  },
  { timestamps: true }
);

/**
 * Returns a plain object with passwordHash stripped out.
 */
userSchema.methods.toSafeObject = function () {
  const obj = this.toObject();
  delete obj.passwordHash;
  return obj;
};

export default mongoose.model('User', userSchema);
