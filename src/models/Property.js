const mongoose = require('mongoose');

const {
  coerceDurationBounds,
  MAX_PROPERTY_DURATION_MONTHS,
  MIN_PROPERTY_DURATION_MONTHS,
} = require('../utils/propertyDurationUtils');
const {
  hasPositiveNumber,
  inferPropertyNumericDefaults,
} = require('../utils/propertyInferenceUtils');

const payoutHistorySchema = new mongoose.Schema(
  {
    amount: { type: Number, required: true },
    currency: { type: String, enum: ['BTC', 'ETH', 'USDT', 'USD'], default: 'USDT' },
    effectiveDate: { type: Date, required: true },
    changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { _id: false }
);

const propertySchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    slug: { type: String, trim: true, lowercase: true, unique: true, sparse: true },
    location: { type: String, required: true },
    addressLine1: { type: String, default: '' },
    addressLine2: { type: String, default: '' },
    city: { type: String, default: '' },
    state: { type: String, default: '' },
    country: { type: String, default: 'United States' },
    postalCode: { type: String, default: '' },
    coordinates: {
      lat: { type: Number, default: null },
      lng: { type: Number, default: null },
    },
    description: { type: String },
    investorHeadline: { type: String, default: '' },
    investorSummary: { type: String, default: '' },
    highlights: { type: [String], default: [] },
    trustBadges: { type: [String], default: [] },
    tags: { type: [String], default: [] },
    market: { type: String, default: '' },
    propertyType: { type: String, default: 'short_stay_home' },
    beds: { type: Number, default: 0 },
    baths: { type: Number, default: 0 },
    sqft: { type: Number, default: 0 },
    images: { type: [String], default: [] },
    coverImage: { type: String, default: '' },
    sourceName: { type: String, default: 'InvestAir' },
    sourceUrl: { type: String, default: '' },
    sourceListingId: { type: String, default: '' },
    totalValue: { type: Number, required: true },
    acquisitionCost: { type: Number, default: 0 },
    targetRaiseAmount: { type: Number, default: 0 },
    availableUnits: { type: Number, default: 0 },
    totalSlots: { type: Number, default: 1 },
    fundedSlots: { type: Number, default: 0 },
    fundedPercentage: { type: Number, default: 0, min: 0, max: 100 },
    totalInvestors: { type: Number, default: 0 },
    expectedAnnualYield: { type: Number, default: 0 },
    slotBasePriceMonthly: { type: Number, default: 0 },
    minimumInvestmentMonths: {
      type: Number,
      default: MIN_PROPERTY_DURATION_MONTHS,
      min: MIN_PROPERTY_DURATION_MONTHS,
      max: MAX_PROPERTY_DURATION_MONTHS,
    },
    maximumInvestmentMonths: {
      type: Number,
      default: 12,
      min: MIN_PROPERTY_DURATION_MONTHS,
      max: MAX_PROPERTY_DURATION_MONTHS,
    },
    allowedDurations: {
      type: [Number],
      default: () => [1, 3, 6, 12],
      validate: {
        validator(value) {
          return Array.isArray(value)
            && value.length > 0
            && value.every(
              (entry) => Number.isInteger(entry)
                && entry >= MIN_PROPERTY_DURATION_MONTHS
                && entry <= MAX_PROPERTY_DURATION_MONTHS
            );
        },
        message: 'allowedDurations must contain whole month values between 1 and 24',
      },
    },
    payoutCurrency: { type: String, enum: ['BTC', 'ETH', 'USDT', 'USD'], default: 'USDT' },
    currentDailyPayoutAmount: { type: Number, default: 0 },
    projectedMonthlyPayoutAmount: { type: Number, default: 0 },
    projectedAnnualPayoutAmount: { type: Number, default: 0 },
    estimatedMonthlyProfit: { type: Number, default: 0 },
    estimatedQuarterlyProfit: { type: Number, default: 0 },
    estimatedYearlyProfit: { type: Number, default: 0 },
    occupancyScore: { type: Number, default: 0, min: 0, max: 100 },
    demandScore: { type: Number, default: 0, min: 0, max: 100 },
    targetOccupancyRate: { type: Number, default: 0, min: 0, max: 100 },
    riskLevel: { type: String, enum: ['low', 'moderate', 'elevated'], default: 'moderate' },
    featured: { type: Boolean, default: false },
    verified: { type: Boolean, default: false },
    profitsWithdrawAnytime: { type: Boolean, default: false },
    capitalWithdrawAnytime: { type: Boolean, default: false },
    adminWithdrawalApproval: { type: Boolean, default: true },
    operatorManaged: { type: Boolean, default: true },
    activeReservations: { type: Number, default: 0 },
    recentPayoutsCount: { type: Number, default: 0 },
    nextAvailableStartDate: { type: Date, default: null },
    payoutHistory: { type: [payoutHistorySchema], default: [] },
    payoutMode: { type: String, enum: ['manual_daily'], default: 'manual_daily' },
    payoutChangedAt: { type: Date },
    payoutChangedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    availabilityWindowLabel: { type: String, default: 'Open for reservations' },
    blockedDates: {
      type: [
        new mongoose.Schema(
          {
            startDate: { type: Date, required: true },
            endDate: { type: Date, required: true },
            reason: { type: String, default: '' },
          },
          { _id: false }
        ),
      ],
      default: [],
    },
    listingType: { type: String, default: '' },
    marketType: { type: String, default: '' },
    yearBuilt: { type: Number, default: 0 },
    amenities: { type: [String], default: [] },
    investmentStatus: { type: String, enum: ['draft', 'active', 'paused', 'sold_out'], default: 'draft' },
    isPublished: { type: Boolean, default: false },
    status: { type: String, enum: ['draft', 'active', 'sold_out'], default: 'draft' },
  },
  { timestamps: true }
);

propertySchema.pre('validate', function normalizeProperty(next) {
  if (!this.location) {
    this.location = [this.city, this.state].filter(Boolean).join(', ') || this.addressLine1 || this.name;
  }

  if (!this.slug) {
    this.slug = String(this.name || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }

  if (!this.coverImage && Array.isArray(this.images) && this.images.length > 0) {
    this.coverImage = this.images[0];
  }

  if (!this.availableUnits && this.totalSlots > 0) {
    this.availableUnits = Math.max(this.totalSlots - this.fundedSlots, 0);
  }

  if (!this.fundedPercentage && this.totalSlots > 0) {
    this.fundedPercentage = Math.min(100, Math.round((this.fundedSlots / this.totalSlots) * 100));
  }

  const durationBounds = coerceDurationBounds(this);
  this.allowedDurations = durationBounds.allowedDurations;
  this.minimumInvestmentMonths = durationBounds.minimumInvestmentMonths;
  this.maximumInvestmentMonths = durationBounds.maximumInvestmentMonths;

  const inferredNumericFields = inferPropertyNumericDefaults(this);
  Object.entries(inferredNumericFields).forEach(([key, value]) => {
    if (!hasPositiveNumber(this[key])) {
      this[key] = value;
    }
  });

  if (!hasPositiveNumber(this.projectedMonthlyPayoutAmount) && this.currentDailyPayoutAmount > 0) {
    this.projectedMonthlyPayoutAmount = this.currentDailyPayoutAmount * 30;
  }

  if (!hasPositiveNumber(this.projectedAnnualPayoutAmount) && this.projectedMonthlyPayoutAmount > 0) {
    this.projectedAnnualPayoutAmount = this.projectedMonthlyPayoutAmount * 12;
  }

  if (!hasPositiveNumber(this.estimatedMonthlyProfit) && this.projectedMonthlyPayoutAmount > 0) {
    this.estimatedMonthlyProfit = this.projectedMonthlyPayoutAmount;
  }

  if (!hasPositiveNumber(this.estimatedQuarterlyProfit) && this.estimatedMonthlyProfit > 0) {
    this.estimatedQuarterlyProfit = this.estimatedMonthlyProfit * 3;
  }

  if (!hasPositiveNumber(this.estimatedYearlyProfit) && this.estimatedMonthlyProfit > 0) {
    this.estimatedYearlyProfit = this.estimatedMonthlyProfit * 12;
  }

  if (!this.investmentStatus) {
    this.investmentStatus = this.status;
  }

  next();
});

module.exports = mongoose.model('Property', propertySchema);
