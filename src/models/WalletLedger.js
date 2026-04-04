const mongoose = require('mongoose');

const walletLedgerSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    wallet: { type: mongoose.Schema.Types.ObjectId, ref: 'Wallet', required: true },
    type: { type: String, required: true },
    amount: { type: Number, required: true },
    currency: { type: String, default: 'USDT' },
    balanceBefore: { type: Number, default: 0 },
    balanceAfter: { type: Number, default: 0 },
    note: { type: String, default: '' },
    referenceModel: { type: String, default: '' },
    referenceId: { type: String, default: '' },
    createdByAdmin: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.models.WalletLedger || mongoose.model('WalletLedger', walletLedgerSchema);
