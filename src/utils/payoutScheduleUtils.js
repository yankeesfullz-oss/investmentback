const MS_PER_DAY = 24 * 60 * 60 * 1000;

function startOfUtcDay(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new Error('Invalid date value');
  }

  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addUtcDays(value, days) {
  const date = startOfUtcDay(value);
  date.setUTCDate(date.getUTCDate() + Number(days || 0));
  return date;
}

function addUtcMonths(value, months) {
  const date = startOfUtcDay(value);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + Number(months || 0), 1));
}

function getUtcMonthStart(value) {
  const date = startOfUtcDay(value);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function getUtcMonthEnd(value) {
  const date = startOfUtcDay(value);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
}

function getDaysInUtcMonth(value) {
  const date = startOfUtcDay(value);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
}

function countInclusiveUtcDays(startValue, endValue) {
  const startDate = startOfUtcDay(startValue);
  const endDate = startOfUtcDay(endValue);

  if (endDate < startDate) {
    return 0;
  }

  return Math.floor((endDate - startDate) / MS_PER_DAY) + 1;
}

function clampPercentage(value) {
  const percentage = Number(value);
  if (!Number.isFinite(percentage)) return 0;
  if (percentage < 0) return 0;
  if (percentage > 100) return 100;
  return percentage;
}

function resolveOccupancyRate(propertyLike) {
  if (propertyLike && propertyLike.occupancyScore != null) {
    return clampPercentage(propertyLike.occupancyScore);
  }

  return clampPercentage(propertyLike?.targetOccupancyRate);
}

function toCurrencyAmount(value) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount)) return 0;
  return Number(amount.toFixed(8));
}

function formatUtcDateKey(value) {
  return startOfUtcDay(value).toISOString().slice(0, 10);
}

function formatUtcMonthKey(value) {
  return formatUtcDateKey(getUtcMonthStart(value)).slice(0, 7);
}

function getMonthlyInvestmentWindow(startValue, endValue, monthReference) {
  const startDate = startOfUtcDay(startValue);
  const endDate = startOfUtcDay(endValue);
  const monthStart = getUtcMonthStart(monthReference);
  const monthEnd = getUtcMonthEnd(monthReference);
  const windowStart = startDate > monthStart ? startDate : monthStart;
  const windowEnd = endDate < monthEnd ? endDate : monthEnd;
  const activeDaysInWindow = countInclusiveUtcDays(windowStart, windowEnd);

  return {
    monthStart,
    monthEnd,
    windowStart,
    windowEnd,
    activeDaysInWindow,
  };
}

function getPayableDaysForWindow(activeDaysInWindow, occupancyRate) {
  const activeDays = Number(activeDaysInWindow || 0);
  if (!Number.isFinite(activeDays) || activeDays <= 0) {
    return 0;
  }

  const payableDays = Math.floor(activeDays * (clampPercentage(occupancyRate) / 100));
  return Math.max(0, Math.min(activeDays, payableDays));
}

function getPayoutDayDetails({ investment, property, payoutDate }) {
  const normalizedPayoutDate = startOfUtcDay(payoutDate);
  const startDate = startOfUtcDay(investment.startDate);
  const endDate = startOfUtcDay(investment.endDate);
  const dailyAmount = toCurrencyAmount(investment.expectedDailyPayout || property?.currentDailyPayoutAmount || 0);
  const occupancyRate = resolveOccupancyRate(property);

  if (normalizedPayoutDate < startDate || normalizedPayoutDate > endDate) {
    return {
      isPayable: false,
      payoutDate: normalizedPayoutDate,
      dailyAmount,
      occupancyRate,
      activeDaysInWindow: 0,
      payableDaysInWindow: 0,
      dayNumberInWindow: 0,
      monthKey: formatUtcMonthKey(normalizedPayoutDate),
    };
  }

  const window = getMonthlyInvestmentWindow(startDate, endDate, normalizedPayoutDate);
  const payableDaysInWindow = getPayableDaysForWindow(window.activeDaysInWindow, occupancyRate);
  const dayNumberInWindow = countInclusiveUtcDays(window.windowStart, normalizedPayoutDate);
  const isPayable = dailyAmount > 0 && payableDaysInWindow > 0 && dayNumberInWindow <= payableDaysInWindow;

  return {
    isPayable,
    payoutDate: normalizedPayoutDate,
    dailyAmount,
    occupancyRate,
    activeDaysInWindow: window.activeDaysInWindow,
    payableDaysInWindow,
    dayNumberInWindow,
    monthKey: formatUtcMonthKey(normalizedPayoutDate),
  };
}

function calculateExpectedPayoutSummary({ startDate, endDate, dailyAmount, occupancyRate }) {
  const normalizedStart = startOfUtcDay(startDate);
  const normalizedEnd = startOfUtcDay(endDate);

  if (normalizedEnd < normalizedStart) {
    return {
      totalPayableDays: 0,
      totalPayout: 0,
      expectedMonthlyPayout: 0,
      monthCount: 0,
    };
  }

  let totalPayableDays = 0;
  let monthCount = 0;

  for (
    let monthCursor = getUtcMonthStart(normalizedStart);
    monthCursor <= getUtcMonthStart(normalizedEnd);
    monthCursor = addUtcMonths(monthCursor, 1)
  ) {
    const { activeDaysInWindow } = getMonthlyInvestmentWindow(normalizedStart, normalizedEnd, monthCursor);

    if (activeDaysInWindow <= 0) {
      continue;
    }

    totalPayableDays += getPayableDaysForWindow(activeDaysInWindow, occupancyRate);
    monthCount += 1;
  }

  const totalPayout = toCurrencyAmount(totalPayableDays * Number(dailyAmount || 0));
  const expectedMonthlyPayout = monthCount > 0 ? toCurrencyAmount(totalPayout / monthCount) : 0;

  return {
    totalPayableDays,
    totalPayout,
    expectedMonthlyPayout,
    monthCount,
  };
}

module.exports = {
  MS_PER_DAY,
  startOfUtcDay,
  addUtcDays,
  addUtcMonths,
  getUtcMonthStart,
  getUtcMonthEnd,
  getDaysInUtcMonth,
  countInclusiveUtcDays,
  clampPercentage,
  resolveOccupancyRate,
  toCurrencyAmount,
  formatUtcDateKey,
  formatUtcMonthKey,
  getMonthlyInvestmentWindow,
  getPayableDaysForWindow,
  getPayoutDayDetails,
  calculateExpectedPayoutSummary,
};