const DailyPayout = require('../models/DailyPayout');
const RentalInvestment = require('../models/RentalInvestment');
const mongoose = require('mongoose');
const {
  creditWalletBalance,
  provisionUserWallets,
} = require('./wallet.service');
const {
  addUtcDays,
  calculateExpectedPayoutSummary,
  formatUtcDateKey,
  getPayoutDayDetails,
  resolveOccupancyRate,
  resolveInvestmentDailyAmount,
  resolveInvestmentOccupancyRate,
  startOfUtcDay,
} = require('../utils/payoutScheduleUtils');

function createHttpError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function resolveLifecycleStatus(investment, targetDate) {
  const businessDate = startOfUtcDay(targetDate);
  const startDate = startOfUtcDay(investment.startDate);
  const endDate = startOfUtcDay(investment.endDate);

  if (investment.paymentStatus !== 'paid') {
    return investment.status;
  }

  if (businessDate < startDate) {
    return 'reserved';
  }

  if (businessDate > endDate) {
    return 'completed';
  }

  return 'active';
}

async function syncInvestmentLifecycleStatuses(targetDate = new Date()) {
  const businessDate = startOfUtcDay(targetDate);

  const [activated, completed] = await Promise.all([
    RentalInvestment.updateMany(
      {
        paymentStatus: 'paid',
        status: { $in: ['reserved', 'pending_payment'] },
        startDate: { $lte: businessDate },
        endDate: { $gte: businessDate },
      },
      { $set: { status: 'active' } }
    ),
    RentalInvestment.updateMany(
      {
        paymentStatus: 'paid',
        status: { $in: ['reserved', 'active'] },
        endDate: { $lt: businessDate },
      },
      { $set: { status: 'completed' } }
    ),
  ]);

  return {
    activatedCount: activated.modifiedCount || 0,
    completedCount: completed.modifiedCount || 0,
  };
}

async function listEligibleInvestments({ targetDate = new Date(), investmentIds = [], userId = null } = {}) {
  const businessDate = startOfUtcDay(targetDate);

  const filter = {
    paymentStatus: 'paid',
    status: { $in: ['reserved', 'active', 'completed'] },
    startDate: { $lte: businessDate },
  };

  if (Array.isArray(investmentIds) && investmentIds.length > 0) {
    filter._id = {
      $in: investmentIds
        .filter(Boolean)
        .map((value) => (mongoose.Types.ObjectId.isValid(value) ? new mongoose.Types.ObjectId(value) : value)),
    };
  }

  if (userId) {
    filter.user = userId;
  }

  return RentalInvestment.find(filter).populate('property');
}

function buildSnapshotPayload({ investment, property }) {
  const payoutDailyAmountSnapshot = resolveInvestmentDailyAmount(investment, property);
  const occupancyRateSnapshot = resolveInvestmentOccupancyRate(investment, property);
  const expectedSummary = calculateExpectedPayoutSummary({
    startDate: investment.startDate,
    endDate: investment.endDate,
    dailyAmount: payoutDailyAmountSnapshot,
    occupancyRate: occupancyRateSnapshot,
  });

  return {
    payoutDailyAmountSnapshot,
    occupancyRateSnapshot,
    expectedDailyPayout: payoutDailyAmountSnapshot,
    expectedMonthlyPayout: expectedSummary.expectedMonthlyPayout,
    expectedTotalPayout: expectedSummary.totalPayout,
  };
}

async function syncInvestmentPayoutSnapshot(investment) {
  const property = investment.property;
  const payload = buildSnapshotPayload({ investment, property });
  const snapshotNeedsWrite = investment.payoutDailyAmountSnapshot == null
    || investment.occupancyRateSnapshot == null
    || investment.expectedDailyPayout == null
    || investment.expectedMonthlyPayout == null
    || investment.expectedTotalPayout == null;

  if (!snapshotNeedsWrite) {
    return payload;
  }

  await RentalInvestment.updateOne({ _id: investment.id }, { $set: payload });
  Object.assign(investment, payload);

  return payload;
}

async function creditDailyPayout({ investment, property, payoutDetails, initiatedByAdmin = null }) {
  if (!property) {
    throw createHttpError('Investment property is missing', 500);
  }

  await provisionUserWallets(investment.user);

  const payoutDateKey = formatUtcDateKey(payoutDetails.payoutDate);
  const note = `Automatic daily payout for ${property.name} on ${payoutDateKey}`;

  const creditResult = await creditWalletBalance({
    userId: investment.user,
    currency: investment.currency,
    amount: payoutDetails.dailyAmount,
    ledgerType: 'automatic_daily_payout_credit',
    transactionType: 'profit_credit',
    note,
    referenceModel: 'RentalInvestment',
    referenceId: investment.id,
    metadata: {
      source: 'automatic_daily_payout',
      payoutDate: payoutDateKey,
      property: property.id,
      propertyName: property.name,
      rentalInvestment: investment.id,
      monthKey: payoutDetails.monthKey,
      occupancyRate: payoutDetails.occupancyRate,
      activeDaysInWindow: payoutDetails.activeDaysInWindow,
      payableDaysInWindow: payoutDetails.payableDaysInWindow,
      dayNumberInWindow: payoutDetails.dayNumberInWindow,
      status: 'paid',
      periodLabel: `Daily payout ${payoutDateKey}`,
    },
    createdByAdmin: initiatedByAdmin,
  });

  await DailyPayout.findOneAndUpdate(
    { rentalInvestment: investment.id, payoutDate: payoutDetails.payoutDate },
    {
      $set: {
        user: investment.user,
        property: property.id,
        rentalInvestment: investment.id,
        wallet: creditResult.wallet.id,
        payoutDate: payoutDetails.payoutDate,
        monthKey: payoutDetails.monthKey,
        currency: investment.currency,
        amount: payoutDetails.dailyAmount,
        occupancyRate: payoutDetails.occupancyRate,
        activeDaysInWindow: payoutDetails.activeDaysInWindow,
        payableDaysInWindow: payoutDetails.payableDaysInWindow,
        dayNumberInWindow: payoutDetails.dayNumberInWindow,
        status: 'paid',
        ledger: creditResult.ledger.id,
        transaction: creditResult.transaction.id,
        processedAt: new Date(),
        initiatedByAdmin,
        errorMessage: '',
      },
    },
    { upsert: true, setDefaultsOnInsert: true }
  );

  await RentalInvestment.updateOne(
    { _id: investment.id },
    { $inc: { accruedPayoutTotal: payoutDetails.dailyAmount }, $set: { status: resolveLifecycleStatus(investment, payoutDetails.payoutDate) } }
  );

  return creditResult;
}

async function markFailedDailyPayout({ investment, property, payoutDetails, error, initiatedByAdmin = null }) {
  await DailyPayout.findOneAndUpdate(
    { rentalInvestment: investment.id, payoutDate: payoutDetails.payoutDate },
    {
      $set: {
        user: investment.user,
        property: property?.id,
        rentalInvestment: investment.id,
        payoutDate: payoutDetails.payoutDate,
        monthKey: payoutDetails.monthKey,
        currency: investment.currency,
        amount: payoutDetails.dailyAmount,
        occupancyRate: payoutDetails.occupancyRate,
        activeDaysInWindow: payoutDetails.activeDaysInWindow,
        payableDaysInWindow: payoutDetails.payableDaysInWindow,
        dayNumberInWindow: payoutDetails.dayNumberInWindow,
        status: 'failed',
        processedAt: new Date(),
        initiatedByAdmin,
        errorMessage: error.message || 'Automatic payout failed',
      },
    },
    { upsert: true, setDefaultsOnInsert: true }
  );
}

async function runAutomaticPayouts({
  targetDate = new Date(),
  catchUp = true,
  initiatedByAdmin = null,
  investmentIds = [],
  userId = null,
  rangeStartDate = null,
  rangeEndDate = null,
} = {}) {
  const businessDate = startOfUtcDay(targetDate);
  const lifecycleSummary = await syncInvestmentLifecycleStatuses(businessDate);
  const effectiveRangeStart = rangeStartDate ? startOfUtcDay(rangeStartDate) : null;
  const effectiveRangeEnd = rangeEndDate ? startOfUtcDay(rangeEndDate) : null;
  const investments = await listEligibleInvestments({ targetDate: businessDate, investmentIds, userId });
  const summary = {
    businessDate: formatUtcDateKey(businessDate),
    catchUp,
    lifecycleSummary,
    investmentsExamined: investments.length,
    investmentsUpdated: 0,
    payoutsCreated: 0,
    payoutsSkipped: 0,
    payoutsFailed: 0,
    totalAmountPaid: 0,
  };

  for (const investment of investments) {
    const property = investment.property;
    const previousDailySnapshot = investment.payoutDailyAmountSnapshot;
    const previousOccupancySnapshot = investment.occupancyRateSnapshot;
    await syncInvestmentPayoutSnapshot(investment);
    if (previousDailySnapshot == null || previousOccupancySnapshot == null) {
      summary.investmentsUpdated += 1;
    }
    const lastEligibleDate = startOfUtcDay(investment.endDate) < businessDate
      ? startOfUtcDay(investment.endDate)
      : businessDate;
    let firstEligibleDate = catchUp ? startOfUtcDay(investment.startDate) : lastEligibleDate;
    let finalEligibleDate = lastEligibleDate;

    if (effectiveRangeStart && effectiveRangeStart > firstEligibleDate) {
      firstEligibleDate = effectiveRangeStart;
    }

    if (effectiveRangeEnd && effectiveRangeEnd < finalEligibleDate) {
      finalEligibleDate = effectiveRangeEnd;
    }

    if (finalEligibleDate < firstEligibleDate) {
      continue;
    }

    const existingPayouts = await DailyPayout.find({
      rentalInvestment: investment.id,
      payoutDate: { $gte: firstEligibleDate, $lte: finalEligibleDate },
      status: 'paid',
    }).select('payoutDate');
    const paidDateKeys = new Set(existingPayouts.map((entry) => formatUtcDateKey(entry.payoutDate)));

    for (
      let payoutDate = firstEligibleDate;
      payoutDate <= finalEligibleDate;
      payoutDate = addUtcDays(payoutDate, 1)
    ) {
      const payoutDateKey = formatUtcDateKey(payoutDate);
      if (paidDateKeys.has(payoutDateKey)) {
        summary.payoutsSkipped += 1;
        continue;
      }

      const payoutDetails = getPayoutDayDetails({
        investment,
        property,
        payoutDate,
      });

      if (!payoutDetails.isPayable) {
        continue;
      }

      try {
        await creditDailyPayout({
          investment,
          property,
          payoutDetails,
          initiatedByAdmin,
        });
        summary.payoutsCreated += 1;
        summary.totalAmountPaid += payoutDetails.dailyAmount;
      } catch (error) {
        summary.payoutsFailed += 1;
        await markFailedDailyPayout({
          investment,
          property,
          payoutDetails,
          error,
          initiatedByAdmin,
        });
      }
    }
  }

  summary.totalAmountPaid = Number(summary.totalAmountPaid.toFixed(8));
  return summary;
}

function calculateInvestmentPayoutExpectations({ property, startDate, endDate, dailyAmount }) {
  const expectationSummary = calculateExpectedPayoutSummary({
    startDate,
    endDate,
    dailyAmount,
    occupancyRate: resolveOccupancyRate(property),
  });

  return {
    expectedDailyPayout: Number(dailyAmount || 0),
    expectedMonthlyPayout: expectationSummary.expectedMonthlyPayout,
    expectedTotalPayout: expectationSummary.totalPayout,
  };
}

async function backfillPayouts({
  targetDate = new Date(),
  initiatedByAdmin = null,
  investmentIds = [],
  userId = null,
  startDate = null,
  endDate = null,
} = {}) {
  return runAutomaticPayouts({
    targetDate: endDate || targetDate,
    catchUp: true,
    initiatedByAdmin,
    investmentIds,
    userId,
    rangeStartDate: startDate,
    rangeEndDate: endDate,
  });
}

module.exports = {
  syncInvestmentLifecycleStatuses,
  runAutomaticPayouts,
  backfillPayouts,
  calculateInvestmentPayoutExpectations,
};