const Transaction = require('../models/Transaction');
const walletService = require('../services/wallet.service');

function normalizeWithdrawalStatus(status) {
  const normalized = String(status || 'pending').toLowerCase();

  if (normalized === 'paid') {
    return 'sent';
  }

  return normalized;
}

function normalizeWithdrawal(transaction) {
  return {
    _id: transaction.id,
    user: transaction.user,
    amount: transaction.amount,
    currency: transaction.currency,
    createdAt: transaction.createdAt,
    updatedAt: transaction.updatedAt,
    status: normalizeWithdrawalStatus(transaction.metadata?.status),
    network: transaction.metadata?.network || 'OTHER',
    destinationAddress: transaction.metadata?.destinationAddress || '',
    adminNote: transaction.metadata?.adminNote || '',
    sentTxHash: transaction.metadata?.sentTxHash || transaction.metadata?.paidTxHash || '',
    sentAt: transaction.metadata?.sentAt || transaction.metadata?.paidAt || null,
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
    const result = await walletService.createWithdrawalRequest({
      userId: req.user.id,
      amount: req.body.amount,
      currency: req.body.currency,
      network: req.body.network,
      destinationAddress: req.body.destinationAddress,
    });

    const populated = await Transaction.findById(result.transaction.id).populate('user', 'fullName email role');
    return res.status(201).json(normalizeWithdrawal(populated));
  } catch (error) {
    return next(error);
  }
}

async function updateWithdrawalStatus(req, res, next) {
  try {
    if (req.params.action !== 'sent') {
      return res.status(400).json({ message: 'Unsupported withdrawal action' });
    }

    await walletService.markWithdrawalAsSent({
      withdrawalId: req.params.id,
      adminUserId: req.user.id,
      adminNote: req.body.adminNote || '',
      sentTxHash: req.body.sentTxHash || req.body.paidTxHash || '',
      sentAt: req.body.sentAt || req.body.paidAt || new Date().toISOString(),
    });

    const populated = await Transaction.findById(req.params.id).populate('user', 'fullName email role');
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