const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    auth0Sub: { type: String, default: '', trim: true, index: true, sparse: true },
    fullName: { type: String, default: '' },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, default: '', select: false },
    role: { type: String, enum: ['admin', 'investor'], default: 'investor' },
    isActive: { type: Boolean, default: true },
    lastLoginAt: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.models.User || mongoose.model('User', userSchema);
