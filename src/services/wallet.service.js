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

async function adminCreditWallet({ userId, email, currency, amount, note, createdByAdmin = null }) {
  if (!userId && !email) {
    throw createHttpError('Provide either userId or email', 400);
  }

  const normalizedCurrency = String(currency || '').trim().toUpperCase();
  if (![BTC, ETH, USDT].includes(normalizedCurrency)) {
    throw createHttpError('currency must be one of BTC, ETH, or USDT', 400);
  }

  const normalizedAmount = Number(amount);
  if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
    throw createHttpError('amount must be greater than zero', 400);
  }

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
    type: 'manual_admin_credit',
    amount: normalizedAmount,
    currency: normalizedCurrency,
    balanceBefore,
    balanceAfter,
    note: note || `Manual admin credit of ${normalizedAmount} ${normalizedCurrency}`,
    createdByAdmin,
  });

  await Transaction.create({
    user: user.id,
    type: 'manual_admin_credit',
    currency: normalizedCurrency,
    amount: normalizedAmount,
    balanceBefore,
    balanceAfter,
    reference: String(ledger.id),
    metadata: {
      source: 'admin_manual_funding',
      wallet: wallet.id,
      createdByAdmin,
      note: ledger.note,
    },
  });

  return {
    user,
    wallet,
    ledger,
    balanceBefore,
    balanceAfter,
  };
}

module.exports = {
  listUserWallets,
  createWallet,
  provisionUserWallets,
  syncAllWalletAddressesToAdminSettings,
  adminCreditWallet,
};
