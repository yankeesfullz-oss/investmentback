const MIN_PROPERTY_DURATION_MONTHS = 1;
const MAX_PROPERTY_DURATION_MONTHS = 24;
const DEFAULT_ALLOWED_DURATIONS = [1, 3, 6, 12];

function normalizeAllowedDurations(value) {
  const source = Array.isArray(value) ? value : [value];

  const normalized = [...new Set(
    source
      .map((entry) => Number(entry))
      .filter(
        (entry) => Number.isInteger(entry)
          && entry >= MIN_PROPERTY_DURATION_MONTHS
          && entry <= MAX_PROPERTY_DURATION_MONTHS
      )
  )].sort((left, right) => left - right);

  return normalized;
}

function resolveAllowedDurations(propertyLike) {
  const normalized = normalizeAllowedDurations(propertyLike?.allowedDurations);

  if (normalized.length > 0) {
    return normalized;
  }

  const fallback = normalizeAllowedDurations([
    propertyLike?.minimumInvestmentMonths,
    propertyLike?.maximumInvestmentMonths,
  ]);

  return fallback.length > 0 ? fallback : DEFAULT_ALLOWED_DURATIONS;
}

function coerceDurationBounds(propertyLike) {
  const allowedDurations = resolveAllowedDurations(propertyLike);
  const minimumInvestmentMonths = allowedDurations[0];
  const maximumInvestmentMonths = allowedDurations[allowedDurations.length - 1];

  return {
    allowedDurations,
    minimumInvestmentMonths,
    maximumInvestmentMonths,
  };
}

function isValidDurationMonths(value) {
  const durationMonths = Number(value);

  return Number.isInteger(durationMonths)
    && durationMonths >= MIN_PROPERTY_DURATION_MONTHS
    && durationMonths <= MAX_PROPERTY_DURATION_MONTHS;
}

module.exports = {
  MIN_PROPERTY_DURATION_MONTHS,
  MAX_PROPERTY_DURATION_MONTHS,
  DEFAULT_ALLOWED_DURATIONS,
  normalizeAllowedDurations,
  resolveAllowedDurations,
  coerceDurationBounds,
  isValidDurationMonths,
};