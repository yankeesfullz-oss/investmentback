const Transaction = require('../models/Transaction');

async function listPayouts(req, res, next) {
  try {
    const filter = {
      type: { $in: ['payout', 'profit_credit'] },
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
        periodLabel: payout.metadata?.periodLabel || payout.reference || 'Profit payout',
      }))
    );
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  listPayouts,
};