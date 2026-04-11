const Wallet = require('../models/Wallet');
const WalletLedger = require('../models/WalletLedger');
const Transaction = require('../models/Transaction');
const User = require('../models/User');
const DepositAddressConfig = require('../models/DepositAddressConfig');
const { BTC, ETH, USDT } = require('../constants/currencies');

const WALLET_DEFAULTS = {
  [BTC]: { network: 'Bitcoin Mainnet', label: 'Bitcoin' },
  [ETH]: { network: 'Ethereum Mainnet', label: 'Ethereum' },
  [USDT]: { network: 'TRC20 / Tron', label: 'Tether USD' },
};
const SUPPORTED_CURRENCIES = [BTC, ETH, USDT];

function createHttpError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

async function listUserWallets(userId) {
  return Wallet.find({ user: userId }).sort({ currency: 1 });
}

async function createWallet(payload) {
  return Wallet.create(payload);
}

async function getOrCreateDepositAddressConfig() {
  let config = await DepositAddressConfig.findOne({ key: 'deposit-addresses' });

  if (!config) {
    config = await DepositAddressConfig.create({ key: 'deposit-addresses' });
  }

  return config;
}

async function provisionUserWallets(userId) {
  const config = await getOrCreateDepositAddressConfig();
  const existingWallets = await Wallet.find({ user: userId });
  const walletsByCurrency = new Map(existingWallets.map((wallet) => [wallet.currency, wallet]));
  const walletsToCreate = [];

  SUPPORTED_CURRENCIES.forEach((currency) => {
    if (walletsByCurrency.has(currency)) {
      return;
    }

    walletsToCreate.push({
      user: userId,
      currency,
      address: String(config?.[currency]?.address || '').trim(),
      encryptedPrivateKey: '',
    });
  });

  if (walletsToCreate.length > 0) {
    await Wallet.insertMany(walletsToCreate);

    walletsToCreate.forEach((wallet) => {
      walletsByCurrency.set(wallet.currency, wallet);
    });
  }

  const syncedWallets = [];
  for (const currency of SUPPORTED_CURRENCIES) {
    const wallet = walletsByCurrency.get(currency);
    if (!wallet) {
      continue;
    }

    const sharedAddress = String(config?.[currency]?.address || '').trim();
    const needsUpdate = wallet.address !== sharedAddress || wallet.encryptedPrivateKey !== '';

    if (!needsUpdate) {
      continue;
    }

    wallet.address = sharedAddress;
    wallet.encryptedPrivateKey = '';
    syncedWallets.push(wallet.save());
  }

  if (syncedWallets.length > 0) {
    await Promise.all(syncedWallets);
  }

  return listUserWallets(userId);
}

async function syncAllWalletAddressesToAdminSettings() {
  const config = await getOrCreateDepositAddressConfig();
  const bulkOperations = SUPPORTED_CURRENCIES.map((currency) => ({
    updateMany: {
      filter: {
        currency,
        $or: [
          { address: { $ne: String(config?.[currency]?.address || '').trim() } },
          { encryptedPrivateKey: { $ne: '' } },
        ],
      },
      update: {
        $set: {
          address: String(config?.[currency]?.address || '').trim(),
          encryptedPrivateKey: '',
        },
      },
    },
  }));

  const result = await Wallet.bulkWrite(bulkOperations, { ordered: false });

  return {
    matchedCount: result.matchedCount || 0,
    modifiedCount: result.modifiedCount || 0,
    config: {
      BTC: {
        address: String(config?.BTC?.address || '').trim(),
        network: config?.BTC?.network || WALLET_DEFAULTS.BTC.network,
        label: config?.BTC?.label || WALLET_DEFAULTS.BTC.label,
      },
      ETH: {
        address: String(config?.ETH?.address || '').trim(),
        network: config?.ETH?.network || WALLET_DEFAULTS.ETH.network,
        label: config?.ETH?.label || WALLET_DEFAULTS.ETH.label,
      },
      USDT: {
        address: String(config?.USDT?.address || '').trim(),
        network: config?.USDT?.network || WALLET_DEFAULTS.USDT.network,
        label: config?.USDT?.label || WALLET_DEFAULTS.USDT.label,
      },
    },
  };
}

async function resolveUser({ userId, email }) {
  if (userId) {
    const user = await User.findById(userId);
    if (user) return user;
  }

  if (email) {
    const user = await User.findOne({ email: String(email).trim().toLowerCase() });
    if (user) return user;
  }

  throw createHttpError('Target user not found', 404);
}

function normalizeCreditCurrency(currency) {
  const normalizedCurrency = String(currency || '').trim().toUpperCase();
  if (![BTC, ETH, USDT].includes(normalizedCurrency)) {
    throw createHttpError('currency must be one of BTC, ETH, or USDT', 400);
  }

  return normalizedCurrency;
}

function normalizeCreditAmount(amount) {
  const normalizedAmount = Number(amount);
  if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
    throw createHttpError('amount must be greater than zero', 400);
  }

  return normalizedAmount;
}

async function creditWalletBalance({
  userId,
  email,
  currency,
  amount,
  note,
  createdByAdmin = null,
  ledgerType = 'manual_admin_credit',
  transactionType = 'manual_admin_credit',
  referenceModel = '',
  referenceId = '',
  metadata = {},
}) {
  if (!userId && !email) {
    throw createHttpError('Provide either userId or email', 400);
  }

  const normalizedCurrency = normalizeCreditCurrency(currency);
  const normalizedAmount = normalizeCreditAmount(amount);

  const user = await resolveUser({ userId, email });
  await provisionUserWallets(user.id);

  const wallet = await Wallet.findOne({ user: user.id, currency: normalizedCurrency });
  if (!wallet) {
    throw createHttpError(`Wallet not found for currency ${normalizedCurrency}`, 404);
  }

  const balanceBefore = Number(wallet.availableBalance || 0);
  const balanceAfter = balanceBefore + normalizedAmount;

  wallet.availableBalance = balanceAfter;
  await wallet.save();

  const ledger = await WalletLedger.create({
    user: user.id,
    wallet: wallet.id,
    type: ledgerType,
    amount: normalizedAmount,
    currency: normalizedCurrency,
    balanceBefore,
    balanceAfter,
    note: note || `${ledgerType} of ${normalizedAmount} ${normalizedCurrency}`,
    referenceModel,
    referenceId,
    createdByAdmin,
  });

  const transaction = await Transaction.create({
    user: user.id,
    type: transactionType,
    currency: normalizedCurrency,
    amount: normalizedAmount,
    balanceBefore,
    balanceAfter,
    reference: referenceId || String(ledger.id),
    metadata: {
      wallet: wallet.id,
      createdByAdmin,
      note: ledger.note,
      referenceModel,
      referenceId,
      ...metadata,
    },
  });

  return {
    user,
    wallet,
    ledger,
    transaction,
    balanceBefore,
    balanceAfter,
  };
}

async function adminCreditWallet({ userId, email, currency, amount, note, createdByAdmin = null }) {
  if (!userId && !email) {
    throw createHttpError('Provide either userId or email', 400);
  }

  const normalizedCurrency = normalizeCreditCurrency(currency);
  const normalizedAmount = normalizeCreditAmount(amount);

  return creditWalletBalance({
    userId,
    email,
    currency: normalizedCurrency,
    amount: normalizedAmount,
    note: note || `Manual admin credit of ${normalizedAmount} ${normalizedCurrency}`,
    createdByAdmin,
    ledgerType: 'manual_admin_credit',
    transactionType: 'manual_admin_credit',
    metadata: {
      source: 'admin_manual_funding',
    },
  });
}

async function createWithdrawalRequest({ userId, amount, currency, network, destinationAddress }) {
  if (!userId) {
    throw createHttpError('userId is required', 400);
  }

  const normalizedCurrency = normalizeCreditCurrency(currency);
  const normalizedAmount = normalizeCreditAmount(amount);
  const normalizedNetwork = String(network || 'OTHER').trim() || 'OTHER';
  const normalizedDestinationAddress = String(destinationAddress || '').trim();

  if (!normalizedDestinationAddress) {
    throw createHttpError('destinationAddress is required', 400);
  }

  await provisionUserWallets(userId);

  const wallet = await Wallet.findOne({ user: userId, currency: normalizedCurrency });
  if (!wallet) {
    throw createHttpError(`Wallet not found for currency ${normalizedCurrency}`, 404);
  }

  const balanceBefore = Number(wallet.availableBalance || 0);
  if (balanceBefore < normalizedAmount) {
    throw createHttpError('Insufficient available wallet balance', 400);
  }

  const balanceAfter = balanceBefore - normalizedAmount;
  wallet.availableBalance = balanceAfter;
  wallet.reservedBalance = Number(wallet.reservedBalance || 0) + normalizedAmount;
  await wallet.save();

  const ledger = await WalletLedger.create({
    user: userId,
    wallet: wallet.id,
    type: 'withdrawal_request_reserve',
    amount: normalizedAmount,
    currency: normalizedCurrency,
    balanceBefore,
    balanceAfter,
    note: `Withdrawal request reserved for ${normalizedAmount} ${normalizedCurrency}`,
    referenceModel: 'Transaction',
    referenceId: '',
  });

  const transaction = await Transaction.create({
    user: userId,
    type: 'withdrawal_request',
    currency: normalizedCurrency,
    amount: normalizedAmount,
    balanceBefore,
    balanceAfter,
    reference: String(ledger.id),
    metadata: {
      status: 'pending',
      network: normalizedNetwork,
      destinationAddress: normalizedDestinationAddress,
      adminNote: '',
      wallet: wallet.id,
      reservedAmount: normalizedAmount,
      statusHistory: [
        {
          status: 'pending',
          changedAt: new Date(),
          changedBy: userId,
        },
      ],
    },
  });

  ledger.referenceId = transaction.id;
  await ledger.save();

  return {
    wallet,
    ledger,
    transaction,
    balanceBefore,
    balanceAfter,
  };
}

async function markWithdrawalAsSent({ withdrawalId, adminUserId = null, adminNote = '', sentTxHash = '', sentAt = null }) {
  const withdrawal = await Transaction.findOne({
    _id: withdrawalId,
    type: { $in: ['withdrawal', 'withdrawal_request'] },
  });

  if (!withdrawal) {
    throw createHttpError('Withdrawal not found', 404);
  }

  const currentStatus = String(withdrawal.metadata?.status || 'pending').toLowerCase();
  if (currentStatus !== 'pending') {
    throw createHttpError('Only pending withdrawals can be marked as sent', 400);
  }

  const walletQuery = {
    user: withdrawal.user,
    currency: withdrawal.currency,
  };
  if (withdrawal.metadata?.wallet) {
    walletQuery._id = withdrawal.metadata.wallet;
  }

  const wallet = await Wallet.findOne(walletQuery);

  if (!wallet) {
    throw createHttpError('Withdrawal wallet not found', 404);
  }

  const withdrawalAmount = Number(withdrawal.amount || 0);
  const reservedAmount = Number(withdrawal.metadata?.reservedAmount || 0);
  const availableBefore = Number(wallet.availableBalance || 0);

  if (reservedAmount > 0) {
    wallet.reservedBalance = Math.max(0, Number(wallet.reservedBalance || 0) - reservedAmount);
  } else if (availableBefore >= withdrawalAmount) {
    wallet.availableBalance = availableBefore - withdrawalAmount;
  } else {
    throw createHttpError('Insufficient wallet balance to complete legacy withdrawal', 400);
  }

  await wallet.save();

  const statusHistory = Array.isArray(withdrawal.metadata?.statusHistory)
    ? withdrawal.metadata.statusHistory.slice()
    : [];
  statusHistory.push({
    status: 'sent',
    changedAt: sentAt ? new Date(sentAt) : new Date(),
    changedBy: adminUserId,
  });

  withdrawal.metadata = {
    ...(withdrawal.metadata || {}),
    status: 'sent',
    adminNote: adminNote || withdrawal.metadata?.adminNote || '',
    sentTxHash: sentTxHash || withdrawal.metadata?.sentTxHash || '',
    sentAt: sentAt ? new Date(sentAt) : (withdrawal.metadata?.sentAt || new Date()),
    statusHistory,
  };
  await withdrawal.save();

  await WalletLedger.create({
    user: withdrawal.user,
    wallet: wallet.id,
    type: 'withdrawal_sent',
    amount: withdrawalAmount,
    currency: withdrawal.currency,
    balanceBefore: availableBefore,
    balanceAfter: Number(wallet.availableBalance || 0),
    note: `Withdrawal sent for ${withdrawalAmount} ${withdrawal.currency}`,
    referenceModel: 'Transaction',
    referenceId: withdrawal.id,
    createdByAdmin: adminUserId,
  });

  return {
    wallet,
    withdrawal,
  };
}

module.exports = {
  listUserWallets,
  createWallet,
  provisionUserWallets,
  syncAllWalletAddressesToAdminSettings,
  creditWalletBalance,
  adminCreditWallet,
  createWithdrawalRequest,
  markWithdrawalAsSent,
};
