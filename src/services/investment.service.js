const Property = require('../models/Property');
const RentalInvestment = require('../models/RentalInvestment');
const Transaction = require('../models/Transaction');
const Wallet = require('../models/Wallet');
const WalletLedger = require('../models/WalletLedger');
const {
  isValidDurationMonths,
  resolveAllowedDurations,
} = require('../utils/propertyDurationUtils');

function createHttpError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function normalizeDate(value, fieldName) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw createHttpError(`Invalid ${fieldName}`, 400);
  }

  return date;
}

function addMonths(startDate, durationMonths) {
  const endDate = new Date(startDate);
  endDate.setUTCMonth(endDate.getUTCMonth() + durationMonths);
  endDate.setUTCDate(endDate.getUTCDate() - 1);
  return endDate;
}

async function listInvestments(filter = {}) {
  return RentalInvestment.find(filter)
    .populate('property')
    .sort({ createdAt: -1 });
}

async function checkSlotAvailability(propertyId, startDate, endDate) {
  const overlappingInvestment = await RentalInvestment.findOne({
    property: propertyId,
    status: { $in: ['reserved', 'active'] },
    startDate: { $lte: endDate },
    endDate: { $gte: startDate },
  });

  return !overlappingInvestment;
}

async function createInvestment(payload) {
  const property = await Property.findById(payload.property);

  if (!property) {
    throw createHttpError('Property not found', 404);
  }

  const durationMonths = Number(payload.durationMonths);
  if (!isValidDurationMonths(durationMonths)) {
    throw createHttpError('durationMonths must be a whole number between 1 and 24', 400);
  }

  const allowedDurations = resolveAllowedDurations(property);
  if (!allowedDurations.includes(durationMonths)) {
    throw createHttpError('This property is not available for the selected duration', 400);
  }

  const slotPrice = Number(payload.slotPrice);
  if (!Number.isFinite(slotPrice) || slotPrice <= 0) {
    throw createHttpError('slotPrice must be greater than zero', 400);
  }

  const startDate = normalizeDate(payload.startDate, 'startDate');
  const endDate = payload.endDate
    ? normalizeDate(payload.endDate, 'endDate')
    : addMonths(startDate, durationMonths);

  if (endDate < startDate) {
    throw createHttpError('endDate must be after startDate', 400);
  }

  const isAvailable = await checkSlotAvailability(property.id, startDate, endDate);
  if (!isAvailable) {
    throw createHttpError('This rental slot overlaps an existing reservation', 409);
  }

  const currency = payload.currency || property.payoutCurrency || 'USDT';
  const wallet = await Wallet.findOne({ user: payload.user, currency });

  if (!wallet) {
    throw createHttpError(`Wallet not found for currency ${currency}`, 404);
  }

  if (wallet.availableBalance < slotPrice) {
    throw createHttpError('Insufficient available wallet balance', 400);
  }

  const expectedDailyPayout = Number(property.currentDailyPayoutAmount || 0);
  const expectedMonthlyPayout = expectedDailyPayout * 30;
  const expectedTotalPayout = expectedDailyPayout * Math.ceil((endDate - startDate) / 86400000 + 1);
  const balanceBefore = wallet.availableBalance;
  const balanceAfter = balanceBefore - slotPrice;

  wallet.availableBalance = balanceAfter;
  wallet.reservedBalance = Number(wallet.reservedBalance || 0) + slotPrice;
  wallet.lockedBalance = Number(wallet.lockedBalance || 0) + slotPrice;
  await wallet.save();

  const investment = await RentalInvestment.create({
    user: payload.user,
    property: property.id,
    startDate,
    endDate,
    durationMonths,
    slotPrice,
    currency,
    expectedDailyPayout,
    expectedMonthlyPayout,
    expectedTotalPayout,
    status: startDate <= new Date() ? 'active' : 'reserved',
    paymentStatus: 'paid',
  });

  await WalletLedger.create({
    user: payload.user,
    wallet: wallet.id,
    type: 'investment_debit',
    amount: slotPrice,
    currency,
    balanceBefore,
    balanceAfter,
    referenceModel: 'RentalInvestment',
    referenceId: investment.id,
    note: `Rental slot reserved for ${property.name}`,
  });

  await Transaction.create({
    user: payload.user,
    type: 'investment',
    currency,
    amount: slotPrice,
    balanceBefore,
    balanceAfter,
    reference: investment.id,
    metadata: {
      property: property.id,
      startDate,
      endDate,
      durationMonths,
      reservedBalance: wallet.reservedBalance,
      model: 'RentalInvestment',
    },
  });

  return RentalInvestment.findById(investment.id).populate('property');
}

module.exports = {
  listInvestments,
  checkSlotAvailability,
  createInvestment,
};
