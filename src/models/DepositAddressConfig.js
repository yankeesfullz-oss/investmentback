const mongoose = require('mongoose');

const currencyAddressSchema = new mongoose.Schema(
  {
    address: { type: String, default: '', trim: true },
    network: { type: String, default: '' },
    label: { type: String, default: '' },
  },
  { _id: false }
);

const depositAddressConfigSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, default: 'deposit-addresses' },
    BTC: { type: currencyAddressSchema, default: () => ({ network: 'Bitcoin Mainnet', label: 'Bitcoin' }) },
    ETH: { type: currencyAddressSchema, default: () => ({ network: 'Ethereum Mainnet', label: 'Ethereum' }) },
    USDT: { type: currencyAddressSchema, default: () => ({ network: 'TRC20 / Tron', label: 'Tether USD' }) },
  },
  { timestamps: true }
);

module.exports = mongoose.models.DepositAddressConfig || mongoose.model('DepositAddressConfig', depositAddressConfigSchema);