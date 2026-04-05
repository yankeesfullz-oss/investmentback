const Transaction = require('../models/Transaction');
const Wallet = require('../models/Wallet');

async function mapDeposits(deposits) {
  const walletIds = [...new Set(
    deposits
      .map((deposit) => deposit.metadata?.wallet)
      .filter(Boolean)
      .map((walletId) => String(walletId))
  )];

  const wallets = walletIds.length > 0
    ? await Wallet.find({ _id: { $in: walletIds } }).select('address currency')
    : [];
  const walletMap = new Map(wallets.map((wallet) => [String(wallet.id), wallet]));

  return deposits.map((deposit) => ({
    _id: deposit.id,
    user: deposit.user,
    amount: deposit.amount,
    currency: deposit.currency,
    createdAt: deposit.createdAt,
    updatedAt: deposit.updatedAt,
    status: deposit.metadata?.status || (deposit.type === 'manual_admin_credit' ? 'completed' : 'pending'),
    txHash: deposit.metadata?.txHash || deposit.reference || '',
    confirmations: Number(deposit.metadata?.confirmations || 0),
    wallet: deposit.metadata?.wallet ? walletMap.get(String(deposit.metadata.wallet)) || null : null,
  }));
}

async function listDeposits(req, res, next) {
  try {
    const filter = {
      type: { $in: ['deposit', 'manual_admin_credit'] },
    };

    if (req.user?.role !== 'admin') {
      filter.user = req.user.id;
    }

    const deposits = await Transaction.find(filter)
      .populate('user', 'fullName email role')
      .sort({ createdAt: -1 });

    return res.status(200).json(await mapDeposits(deposits));
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  listDeposits,
};