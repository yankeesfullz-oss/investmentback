const referralService = require('../services/referral.service');

function serializeCommission(commission) {
  return {
    _id: commission.id,
    adminNote: commission.adminNote || '',
    commissionAmount: Number(commission.commissionAmount || 0),
    createdAt: commission.createdAt,
    currency: commission.currency,
    earnedAt: commission.earnedAt,
    paidAt: commission.paidAt,
    qualifyingAmount: Number(commission.qualifyingAmount || 0),
    qualifyingInvestment: commission.qualifyingInvestment,
    referredInvestorUser: commission.referredInvestorUser,
    referrerUser: commission.referrerUser,
    status: commission.status,
    updatedAt: commission.updatedAt,
  };
}

async function getMyReferralSummary(req, res, next) {
  try {
    const summary = await referralService.getReferralSummary(req.user.id);

    return res.status(200).json({
      ...summary,
      commissions: summary.commissions.map(serializeCommission),
    });
  } catch (error) {
    return next(error);
  }
}

async function listAdminReferralCommissions(req, res, next) {
  try {
    const commissions = await referralService.listAdminReferralCommissions();
    return res.status(200).json(commissions.map(serializeCommission));
  } catch (error) {
    return next(error);
  }
}

async function payReferralCommission(req, res, next) {
  try {
    const commission = await referralService.markReferralCommissionPaid({
      adminNote: req.body?.adminNote || '',
      adminUserId: req.user?.id || null,
      commissionId: req.params.referralCommissionId,
    });

    return res.status(200).json(serializeCommission(commission));
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  getMyReferralSummary,
  listAdminReferralCommissions,
  payReferralCommission,
};