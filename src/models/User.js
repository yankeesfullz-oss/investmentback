const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    auth0Sub: { type: String, default: '', trim: true, index: true, sparse: true },
    fullName: { type: String, default: '' },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, default: '', select: false },
    referralCode: { type: String, default: '', uppercase: true, trim: true, unique: true, sparse: true },
    referrerUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    role: { type: String, enum: ['admin', 'investor'], default: 'investor' },
    isActive: { type: Boolean, default: true },
    lastLoginAt: { type: Date, default: null },
  },
  { timestamps: true }
);

userSchema.pre('save', async function hashPassword(next) {
  if (!this.isModified('password') || !this.password) {
    return next();
  }

  try {
    this.password = await bcrypt.hash(this.password, 12);
    return next();
  } catch (error) {
    return next(error);
  }
});

userSchema.methods.comparePassword = function comparePassword(candidatePassword) {
  return bcrypt.compare(String(candidatePassword || ''), this.password || '');
};

module.exports = mongoose.models.User || mongoose.model('User', userSchema);
