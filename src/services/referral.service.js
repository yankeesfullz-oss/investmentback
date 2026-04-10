const crypto = require('crypto');

const ReferralCommission = require('../models/ReferralCommission');
const User = require('../models/User');
const { creditWalletBalance } = require('./wallet.service');

const MINIMUM_QUALIFYING_INVESTMENT = 3000;
const REFERRAL_COMMISSION_AMOUNT = 500;
const REFERRAL_COMMISSION_CURRENCY = 'USDT';

function createHttpError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function buildReferralCode() {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
}

async function generateUniqueReferralCode() {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const referralCode = buildReferralCode();
    const existingUser = await User.findOne({ referralCode }).select('_id');

    if (!existingUser) {
      return referralCode;
    }
  }

  throw createHttpError('Unable to generate a referral code right now', 500);
}

async function resolveReferrerByCode(referralCode) {
  const normalizedCode = String(referralCode || '').trim().toUpperCase();
  if (!normalizedCode) {
    return null;
  }

  const user = await User.findOne({ referralCode: normalizedCode, role: 'investor' }).select('_id email fullName referralCode');
  if (!user) {
    throw createHttpError('Referral code is invalid', 400);
  }

  return user;
}

async function ensureReferralCodeForUser(userId) {
  const user = await User.findById(userId).select('referralCode');
  if (!user) {
    throw createHttpError('User not found', 404);
  }

  if (user.referralCode) {
    return user.referralCode;
  }

  user.referralCode = await generateUniqueReferralCode();
  await user.save();
  return user.referralCode;
}

async function qualifyReferralCommission({ investment }) {
  if (!investment?.user) {
    return null;
  }

  const qualifyingAmount = Number(investment.slotPrice || 0);
  if (!Number.isFinite(qualifyingAmount) || qualifyingAmount < MINIMUM_QUALIFYING_INVESTMENT) {
    return null;
  }

  const referredInvestor = await User.findById(investment.user).select('referrerUser');
  if (!referredInvestor?.referrerUser) {
    return null;
  }

  const existingCommission = await ReferralCommission.findOne({ referredInvestorUser: investment.user });
  if (existingCommission) {
    return existingCommission;
  }

  return ReferralCommission.create({
    referrerUser: referredInvestor.referrerUser,
    referredInvestorUser: investment.user,
    qualifyingInvestment: investment.id,
    qualifyingAmount,
    commissionAmount: REFERRAL_COMMISSION_AMOUNT,
    currency: REFERRAL_COMMISSION_CURRENCY,
    status: 'earned',
    earnedAt: new Date(),
  });
}

async function getReferralSummary(userId) {
  const referralCode = await ensureReferralCodeForUser(userId);
  const commissions = await ReferralCommission.find({ referrerUser: userId })
    .populate('referredInvestorUser', 'fullName email')
    .populate('qualifyingInvestment', 'slotPrice currency createdAt property')
    .sort({ earnedAt: -1 });

  const totals = commissions.reduce(
    (summary, commission) => {
      summary.totalEarned += Number(commission.commissionAmount || 0);
      if (commission.status === 'paid') {
        summary.totalPaid += Number(commission.commissionAmount || 0);
      } else {
        summary.totalPending += Number(commission.commissionAmount || 0);
      }
      return summary;
    },
    { totalEarned: 0, totalPaid: 0, totalPending: 0 }
  );

  return {
    referralCode,
    commissionAmount: REFERRAL_COMMISSION_AMOUNT,
    minimumInvestmentAmount: MINIMUM_QUALIFYING_INVESTMENT,
    currency: REFERRAL_COMMISSION_CURRENCY,
    totals,
    commissions,
  };
}

async function listAdminReferralCommissions() {
  return ReferralCommission.find({})
    .populate('referrerUser', 'fullName email')
    .populate('referredInvestorUser', 'fullName email')
    .populate('qualifyingInvestment', 'slotPrice currency createdAt')
    .sort({ earnedAt: -1 });
}

async function markReferralCommissionPaid({ commissionId, adminUserId = null, adminNote = '' }) {
  const commission = await ReferralCommission.findById(commissionId)
    .populate('referrerUser', 'fullName email')
    .populate('referredInvestorUser', 'fullName email');

  if (!commission) {
    throw createHttpError('Referral commission not found', 404);
  }

  if (commission.status === 'paid') {
    throw createHttpError('Referral commission has already been paid', 400);
  }

  const payoutResult = await creditWalletBalance({
    userId: commission.referrerUser.id,
    currency: commission.currency,
    amount: commission.commissionAmount,
    note: `Referral commission payout for ${commission.referredInvestorUser?.email || 'referred investor'}`,
    createdByAdmin: adminUserId,
    ledgerType: 'referral_commission_credit',
    transactionType: 'referral_commission_payout',
    referenceModel: 'ReferralCommission',
    referenceId: String(commission.id),
    metadata: {
      source: 'referral_commission',
      referredInvestorEmail: commission.referredInvestorUser?.email || '',
      referredInvestorUser: commission.referredInvestorUser?.id || null,
      qualifyingInvestment: commission.qualifyingInvestment,
      status: 'paid',
    },
  });

  commission.status = 'paid';
  commission.paidAt = new Date();
  commission.adminNote = String(adminNote || '').trim();
  commission.payoutTransaction = payoutResult.transaction.id;
  commission.payoutLedger = payoutResult.ledger.id;
  await commission.save();

  return ReferralCommission.findById(commission.id)
    .populate('referrerUser', 'fullName email')
    .populate('referredInvestorUser', 'fullName email')
    .populate('qualifyingInvestment', 'slotPrice currency createdAt');
}

module.exports = {
  MINIMUM_QUALIFYING_INVESTMENT,
  REFERRAL_COMMISSION_AMOUNT,
  REFERRAL_COMMISSION_CURRENCY,
  ensureReferralCodeForUser,
  generateUniqueReferralCode,
  getReferralSummary,
  listAdminReferralCommissions,
  markReferralCommissionPaid,
  qualifyReferralCommission,
  resolveReferrerByCode,
};