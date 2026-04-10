const mongoose = require('mongoose');

const dailyPayoutSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    property: { type: mongoose.Schema.Types.ObjectId, ref: 'Property', required: true, index: true },
    rentalInvestment: { type: mongoose.Schema.Types.ObjectId, ref: 'RentalInvestment', required: true, index: true },
    wallet: { type: mongoose.Schema.Types.ObjectId, ref: 'Wallet', default: null },
    payoutDate: { type: Date, required: true, index: true },
    monthKey: { type: String, required: true, trim: true },
    currency: { type: String, enum: ['BTC', 'ETH', 'USDT', 'USD'], default: 'USDT' },
    amount: { type: Number, required: true, default: 0 },
    occupancyRate: { type: Number, default: 0, min: 0, max: 100 },
    activeDaysInWindow: { type: Number, default: 0 },
    payableDaysInWindow: { type: Number, default: 0 },
    dayNumberInWindow: { type: Number, default: 0 },
    status: { type: String, enum: ['paid', 'failed'], default: 'paid', index: true },
    ledger: { type: mongoose.Schema.Types.ObjectId, ref: 'WalletLedger', default: null },
    transaction: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction', default: null },
    processedAt: { type: Date, default: Date.now },
    initiatedByAdmin: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    errorMessage: { type: String, default: '' },
  },
  { timestamps: true }
);

dailyPayoutSchema.index(
  { rentalInvestment: 1, payoutDate: 1 },
  { unique: true, name: 'investment_payout_date_unique_idx' }
);

module.exports = mongoose.models.DailyPayout || mongoose.model('DailyPayout', dailyPayoutSchema);