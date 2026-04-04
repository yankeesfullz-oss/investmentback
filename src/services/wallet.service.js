const Wallet = require('../models/Wallet');
const WalletSequence = require('../models/WalletSequence');
const WalletLedger = require('../models/WalletLedger');
const Transaction = require('../models/Transaction');
const User = require('../models/User');
const { BTC, ETH, USDT } = require('../constants/currencies');
const { generateBtcWallet } = require('../blockchain/btcWalletGenerator');
const { generateEthWallet } = require('../blockchain/ethWalletGenerator');
const { generateUsdtWallet } = require('../blockchain/usdtWalletGenerator');

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

async function reserveWalletIndex(sequenceKey) {
  const sequence = await WalletSequence.findOneAndUpdate(
    { key: sequenceKey },
    { $inc: { nextIndex: 1 } },
    {
      new: false,
      upsert: true,
      setDefaultsOnInsert: true,
    }
  );

  return sequence ? sequence.nextIndex : 0;
}

async function createUniqueWallet(userId, currency, sequenceKey, generator) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const index = await reserveWalletIndex(sequenceKey);
    const wallet = await generator(userId, { index });
    const existingWallet = await Wallet.exists({ address: wallet.address });

    if (!existingWallet) {
      return {
        user: userId,
        currency,
        address: wallet.address,
        encryptedPrivateKey: wallet.encryptedPrivateKey,
      };
    }
  }

  throw new Error(`Unable to allocate a unique ${currency} wallet address.`);
}

async function provisionUserWallets(userId) {
  const existingWallets = await Wallet.find({ user: userId });
  const existingCurrencies = new Set(existingWallets.map((wallet) => wallet.currency));
  const walletsToCreate = [];

  if (!existingCurrencies.has(BTC)) {
    walletsToCreate.push(await createUniqueWallet(userId, BTC, 'btc', generateBtcWallet));
  }

  if (!existingCurrencies.has(ETH)) {
    walletsToCreate.push(await createUniqueWallet(userId, ETH, 'eth', generateEthWallet));
  }

  if (!existingCurrencies.has(USDT)) {
    walletsToCreate.push(await createUniqueWallet(userId, USDT, 'usdt', generateUsdtWallet));
  }

  if (walletsToCreate.length > 0) {
    await Wallet.insertMany(walletsToCreate);
  }

  return listUserWallets(userId);
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
  adminCreditWallet,
};
