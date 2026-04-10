const test = require('node:test');
const assert = require('node:assert/strict');

const {
  calculateExpectedPayoutSummary,
  getDaysInUtcMonth,
  getPayoutDayDetails,
} = require('../src/utils/payoutScheduleUtils');

test('returns correct month lengths for february and 31-day months', () => {
  assert.equal(getDaysInUtcMonth(new Date('2026-02-11T12:00:00Z')), 28);
  assert.equal(getDaysInUtcMonth(new Date('2026-03-11T12:00:00Z')), 31);
  assert.equal(getDaysInUtcMonth(new Date('2028-02-11T12:00:00Z')), 29);
});

test('pays only the first 15 days in a 30-day month at 50 percent occupancy', () => {
  const investment = {
    startDate: '2026-04-01T00:00:00Z',
    endDate: '2026-04-30T00:00:00Z',
    expectedDailyPayout: 100,
  };
  const property = { occupancyScore: 50 };

  const payableDay = getPayoutDayDetails({ investment, property, payoutDate: '2026-04-15T00:00:00Z' });
  const blockedDay = getPayoutDayDetails({ investment, property, payoutDate: '2026-04-16T00:00:00Z' });

  assert.equal(payableDay.isPayable, true);
  assert.equal(payableDay.payableDaysInWindow, 15);
  assert.equal(blockedDay.isPayable, false);
});

test('pays only the first 15 days in a 31-day month at 50 percent occupancy', () => {
  const investment = {
    startDate: '2026-03-01T00:00:00Z',
    endDate: '2026-03-31T00:00:00Z',
    expectedDailyPayout: 100,
  };
  const property = { occupancyScore: 50 };

  const payableDay = getPayoutDayDetails({ investment, property, payoutDate: '2026-03-15T00:00:00Z' });
  const blockedDay = getPayoutDayDetails({ investment, property, payoutDate: '2026-03-16T00:00:00Z' });

  assert.equal(payableDay.isPayable, true);
  assert.equal(payableDay.payableDaysInWindow, 15);
  assert.equal(blockedDay.isPayable, false);
});

test('prorates the first partial month from the investment start date', () => {
  const investment = {
    startDate: '2026-03-16T00:00:00Z',
    endDate: '2026-03-31T00:00:00Z',
    expectedDailyPayout: 100,
  };
  const property = { occupancyScore: 50 };

  const payableDay = getPayoutDayDetails({ investment, property, payoutDate: '2026-03-23T00:00:00Z' });
  const blockedDay = getPayoutDayDetails({ investment, property, payoutDate: '2026-03-24T00:00:00Z' });

  assert.equal(payableDay.activeDaysInWindow, 16);
  assert.equal(payableDay.payableDaysInWindow, 8);
  assert.equal(payableDay.isPayable, true);
  assert.equal(blockedDay.isPayable, false);
});

test('calculates february total payout with occupancy-aware rounding', () => {
  const summary = calculateExpectedPayoutSummary({
    startDate: '2026-02-01T00:00:00Z',
    endDate: '2026-02-28T00:00:00Z',
    dailyAmount: 100,
    occupancyRate: 50,
  });

  assert.equal(summary.totalPayableDays, 14);
  assert.equal(summary.totalPayout, 1400);
  assert.equal(summary.expectedMonthlyPayout, 1400);
});