const DailyPayout = require('../models/DailyPayout');
const RentalInvestment = require('../models/RentalInvestment');
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

async function listEligibleInvestments(targetDate = new Date()) {
  const businessDate = startOfUtcDay(targetDate);

  return RentalInvestment.find({
    paymentStatus: 'paid',
    status: { $in: ['reserved', 'active', 'completed'] },
    startDate: { $lte: businessDate },
  }).populate('property');
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

async function runAutomaticPayouts({ targetDate = new Date(), catchUp = true, initiatedByAdmin = null } = {}) {
  const businessDate = startOfUtcDay(targetDate);
  const lifecycleSummary = await syncInvestmentLifecycleStatuses(businessDate);
  const investments = await listEligibleInvestments(businessDate);
  const summary = {
    businessDate: formatUtcDateKey(businessDate),
    catchUp,
    lifecycleSummary,
    investmentsExamined: investments.length,
    payoutsCreated: 0,
    payoutsSkipped: 0,
    payoutsFailed: 0,
    totalAmountPaid: 0,
  };

  for (const investment of investments) {
    const property = investment.property;
    const lastEligibleDate = startOfUtcDay(investment.endDate) < businessDate
      ? startOfUtcDay(investment.endDate)
      : businessDate;
    const firstEligibleDate = catchUp ? startOfUtcDay(investment.startDate) : lastEligibleDate;

    if (lastEligibleDate < firstEligibleDate) {
      continue;
    }

    const existingPayouts = await DailyPayout.find({
      rentalInvestment: investment.id,
      payoutDate: { $gte: firstEligibleDate, $lte: lastEligibleDate },
      status: 'paid',
    }).select('payoutDate');
    const paidDateKeys = new Set(existingPayouts.map((entry) => formatUtcDateKey(entry.payoutDate)));

    for (
      let payoutDate = firstEligibleDate;
      payoutDate <= lastEligibleDate;
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

module.exports = {
  syncInvestmentLifecycleStatuses,
  runAutomaticPayouts,
  calculateInvestmentPayoutExpectations,
};