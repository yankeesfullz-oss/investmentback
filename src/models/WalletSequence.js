const mongoose = require('mongoose');

const walletSequenceSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    nextIndex: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.models.WalletSequence || mongoose.model('WalletSequence', walletSequenceSchema);
