const mongoose = require('mongoose');

const {
  MAX_PROPERTY_DURATION_MONTHS,
  MIN_PROPERTY_DURATION_MONTHS,
} = require('../utils/propertyDurationUtils');

const rentalInvestmentSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    property: { type: mongoose.Schema.Types.ObjectId, ref: 'Property', required: true, index: true },
    startDate: { type: Date, required: true, index: true },
    endDate: { type: Date, required: true, index: true },
    durationMonths: {
      type: Number,
      required: true,
      min: MIN_PROPERTY_DURATION_MONTHS,
      max: MAX_PROPERTY_DURATION_MONTHS,
      validate: {
        validator(value) {
          return Number.isInteger(value);
        },
        message: 'durationMonths must be a whole number of months',
      },
    },
    slotPrice: { type: Number, required: true },
    currency: { type: String, enum: ['BTC', 'ETH', 'USDT', 'USD'], default: 'USDT' },
    payoutDailyAmountSnapshot: { type: Number, default: 0 },
    occupancyRateSnapshot: { type: Number, default: 0, min: 0, max: 100 },
    expectedDailyPayout: { type: Number, default: 0 },
    expectedMonthlyPayout: { type: Number, default: 0 },
    expectedTotalPayout: { type: Number, default: 0 },
    accruedPayoutTotal: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ['pending_payment', 'reserved', 'active', 'completed', 'cancelled'],
      default: 'reserved',
      index: true,
    },
    paymentStatus: {
      type: String,
      enum: ['pending', 'paid', 'failed', 'refunded'],
      default: 'paid',
      index: true,
    },
  },
  { timestamps: true }
);

rentalInvestmentSchema.index(
  { property: 1, startDate: 1, endDate: 1, status: 1 },
  { name: 'property_slot_range_status_idx' }
);

module.exports = mongoose.model('RentalInvestment', rentalInvestmentSchema);