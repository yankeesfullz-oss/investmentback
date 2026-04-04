const mongoose = require('mongoose');

const walletSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    currency: { type: String, enum: ['BTC', 'ETH', 'USDT'], required: true },
    address: { type: String, default: '', index: true },
    encryptedPrivateKey: { type: String, default: '' },
    availableBalance: { type: Number, default: 0 },
    lockedBalance: { type: Number, default: 0 },
    reservedBalance: { type: Number, default: 0 },
    profitBalance: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.models.Wallet || mongoose.model('Wallet', walletSchema);
