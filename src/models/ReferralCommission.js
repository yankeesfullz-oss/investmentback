const mongoose = require('mongoose');

const referralCommissionSchema = new mongoose.Schema(
  {
    referrerUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    referredInvestorUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    qualifyingInvestment: { type: mongoose.Schema.Types.ObjectId, ref: 'RentalInvestment', required: true },
    qualifyingAmount: { type: Number, required: true },
    commissionAmount: { type: Number, default: 500 },
    currency: { type: String, default: 'USDT' },
    status: { type: String, enum: ['earned', 'paid'], default: 'earned' },
    earnedAt: { type: Date, default: Date.now },
    paidAt: { type: Date, default: null },
    payoutTransaction: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction', default: null },
    payoutLedger: { type: mongoose.Schema.Types.ObjectId, ref: 'WalletLedger', default: null },
    adminNote: { type: String, default: '' },
  },
  { timestamps: true }
);

referralCommissionSchema.index({ referrerUser: 1, earnedAt: -1 });

module.exports = mongoose.models.ReferralCommission || mongoose.model('ReferralCommission', referralCommissionSchema);