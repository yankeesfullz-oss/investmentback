const DepositAddressConfig = require('../models/DepositAddressConfig');
const { syncAllWalletAddressesToAdminSettings } = require('../services/wallet.service');

const DEFAULTS = {
  BTC: { network: 'Bitcoin Mainnet', label: 'Bitcoin' },
  ETH: { network: 'Ethereum Mainnet', label: 'Ethereum' },
  USDT: { network: 'TRC20 / Tron', label: 'Tether USD' },
};

async function getOrCreateConfig() {
  let config = await DepositAddressConfig.findOne({ key: 'deposit-addresses' });

  if (!config) {
    config = await DepositAddressConfig.create({ key: 'deposit-addresses' });
  }

  return config;
}

function serializeConfig(config) {
  return {
    BTC: {
      address: config?.BTC?.address || '',
      network: config?.BTC?.network || DEFAULTS.BTC.network,
      label: config?.BTC?.label || DEFAULTS.BTC.label,
    },
    ETH: {
      address: config?.ETH?.address || '',
      network: config?.ETH?.network || DEFAULTS.ETH.network,
      label: config?.ETH?.label || DEFAULTS.ETH.label,
    },
    USDT: {
      address: config?.USDT?.address || '',
      network: config?.USDT?.network || DEFAULTS.USDT.network,
      label: config?.USDT?.label || DEFAULTS.USDT.label,
    },
    updatedAt: config?.updatedAt || null,
  };
}

async function getDepositSettings(req, res, next) {
  try {
    const config = await getOrCreateConfig();
    return res.status(200).json(serializeConfig(config));
  } catch (error) {
    return next(error);
  }
}

async function updateDepositSettings(req, res, next) {
  try {
    const config = await getOrCreateConfig();

    ['BTC', 'ETH', 'USDT'].forEach((currency) => {
      const nextValue = req.body?.[currency];
      if (!nextValue || typeof nextValue !== 'object') {
        return;
      }

      config[currency] = {
        address: String(nextValue.address || '').trim(),
        network: String(nextValue.network || DEFAULTS[currency].network).trim(),
        label: String(nextValue.label || DEFAULTS[currency].label).trim(),
      };
    });

    await config.save();
    const syncResult = await syncAllWalletAddressesToAdminSettings();

    return res.status(200).json({
      ...serializeConfig(config),
      syncedWallets: syncResult.modifiedCount,
      matchedWallets: syncResult.matchedCount,
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  getDepositSettings,
  updateDepositSettings,
};