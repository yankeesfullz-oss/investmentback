const Transaction = require('../models/Transaction');
const payoutService = require('../services/payout.service');

async function listPayouts(req, res, next) {
  try {
    const filter = {
      type: { $in: ['payout', 'profit_credit', 'referral_commission_payout'] },
    };

    if (req.user?.role !== 'admin') {
      filter.user = req.user.id;
    }

    const payouts = await Transaction.find(filter)
      .populate('user', 'fullName email role')
      .sort({ createdAt: -1 });

    return res.status(200).json(
      payouts.map((payout) => ({
        _id: payout.id,
        user: payout.user,
        amount: payout.amount,
        currency: payout.currency,
        createdAt: payout.createdAt,
        updatedAt: payout.updatedAt,
        status: payout.metadata?.status || 'paid',
        periodLabel: payout.metadata?.periodLabel || payout.metadata?.note || payout.reference || 'Profit payout',
        payoutDate: payout.metadata?.payoutDate || null,
        property: payout.metadata?.property || null,
        propertyName: payout.metadata?.propertyName || '',
        occupancyRate: payout.metadata?.occupancyRate ?? null,
        source: payout.metadata?.source || 'property_payout',
      }))
    );
  } catch (error) {
    return next(error);
  }
}

async function runAutomaticPayouts(req, res, next) {
  try {
    const targetDate = req.body?.date ? new Date(req.body.date) : new Date();
    const catchUp = req.body?.catchUp !== false;

    const summary = await payoutService.runAutomaticPayouts({
      targetDate,
      catchUp,
      initiatedByAdmin: req.user?.id || null,
    });

    return res.status(200).json(summary);
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  listPayouts,
  runAutomaticPayouts,
};