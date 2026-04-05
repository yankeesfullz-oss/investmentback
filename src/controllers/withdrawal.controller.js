const Transaction = require('../models/Transaction');

function normalizeWithdrawal(transaction) {
  return {
    _id: transaction.id,
    user: transaction.user,
    amount: transaction.amount,
    currency: transaction.currency,
    createdAt: transaction.createdAt,
    updatedAt: transaction.updatedAt,
    status: transaction.metadata?.status || 'pending',
    network: transaction.metadata?.network || 'OTHER',
    destinationAddress: transaction.metadata?.destinationAddress || '',
    adminNote: transaction.metadata?.adminNote || '',
    paidTxHash: transaction.metadata?.paidTxHash || '',
    paidAt: transaction.metadata?.paidAt || null,
  };
}

async function listWithdrawals(req, res, next) {
  try {
    const filter = {
      type: { $in: ['withdrawal', 'withdrawal_request'] },
    };

    if (req.user?.role !== 'admin') {
      filter.user = req.user.id;
    }

    const withdrawals = await Transaction.find(filter)
      .populate('user', 'fullName email role')
      .sort({ createdAt: -1 });

    return res.status(200).json(withdrawals.map(normalizeWithdrawal));
  } catch (error) {
    return next(error);
  }
}

async function createWithdrawal(req, res, next) {
  try {
    const amount = Number(req.body.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ message: 'amount must be greater than zero' });
    }

    const withdrawal = await Transaction.create({
      user: req.user.id,
      type: 'withdrawal_request',
      amount,
      currency: req.body.currency || 'USDT',
      metadata: {
        status: 'pending',
        network: req.body.network || 'OTHER',
        destinationAddress: req.body.destinationAddress || '',
        adminNote: '',
      },
    });

    const populated = await Transaction.findById(withdrawal.id).populate('user', 'fullName email role');
    return res.status(201).json(normalizeWithdrawal(populated));
  } catch (error) {
    return next(error);
  }
}

async function updateWithdrawalStatus(req, res, next) {
  try {
    const actionMap = {
      processing: 'processing',
      paid: 'paid',
      reject: 'rejected',
    };
    const nextStatus = actionMap[req.params.action];

    if (!nextStatus) {
      return res.status(400).json({ message: 'Unsupported withdrawal action' });
    }

    const withdrawal = await Transaction.findOne({
      _id: req.params.id,
      type: { $in: ['withdrawal', 'withdrawal_request'] },
    });

    if (!withdrawal) {
      return res.status(404).json({ message: 'Withdrawal not found' });
    }

    withdrawal.metadata = {
      ...(withdrawal.metadata || {}),
      status: nextStatus,
      adminNote: req.body.adminNote || withdrawal.metadata?.adminNote || '',
      paidTxHash: req.body.paidTxHash || withdrawal.metadata?.paidTxHash || '',
      paidAt: req.body.paidAt || withdrawal.metadata?.paidAt || null,
    };

    await withdrawal.save();

    const populated = await Transaction.findById(withdrawal.id).populate('user', 'fullName email role');
    return res.status(200).json(normalizeWithdrawal(populated));
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  listWithdrawals,
  createWithdrawal,
  updateWithdrawalStatus,
};