function toNumber(value) {
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : null;
}

function roundCurrency(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function hasPositiveNumber(value) {
  const normalized = toNumber(value);
  return normalized !== null && normalized > 0;
}

function hasNonNegativeNumber(value) {
  const normalized = toNumber(value);
  return normalized !== null && normalized >= 0;
}

function isBlankAutofillValue(value) {
  if (Array.isArray(value)) {
    return value.length === 0;
  }

  if (value === null || value === undefined) {
    return true;
  }

  if (typeof value === 'string') {
    return value.trim() === '';
  }

  if (typeof value === 'number') {
    return !Number.isFinite(value) || value <= 0;
  }

  return false;
}

function inferBedroomTier(propertyLike = {}) {
  const explicitBeds = toNumber(propertyLike.beds);
  if (explicitBeds !== null && explicitBeds > 0) {
    return Math.max(1, Math.round(explicitBeds));
  }

  const sqft = toNumber(propertyLike.sqft);
  if (sqft !== null && sqft > 0) {
    if (sqft <= 650) return 1;
    if (sqft <= 1000) return 2;
    if (sqft <= 1450) return 3;
    if (sqft <= 1900) return 4;
    return 5;
  }

  return 1;
}

function inferBathsFromTier(bedroomTier) {
  if (bedroomTier <= 1) return 1;
  if (bedroomTier === 2) return 1.5;
  if (bedroomTier === 3) return 2;
  if (bedroomTier === 4) return 2.5;
  return 3;
}

function inferSqftFromTier(bedroomTier) {
  if (bedroomTier <= 1) return 550;
  if (bedroomTier === 2) return 900;
  if (bedroomTier === 3) return 1250;
  if (bedroomTier === 4) return 1650;
  return 2100 + ((bedroomTier - 5) * 350);
}

function inferYieldFromTier(bedroomTier) {
  if (bedroomTier <= 1) return 8;
  if (bedroomTier === 2) return 8.5;
  if (bedroomTier === 3) return 8.2;
  if (bedroomTier === 4) return 7.8;
  return 7.4;
}

function inferOccupancyFromTier(bedroomTier) {
  if (bedroomTier <= 1) return 60;
  if (bedroomTier === 2) return 66;
  if (bedroomTier === 3) return 74;
  if (bedroomTier === 4) return 82;
  return 88;
}

function inferDemandFromTier(bedroomTier) {
  if (bedroomTier <= 1) return 56;
  if (bedroomTier === 2) return 63;
  if (bedroomTier === 3) return 70;
  if (bedroomTier === 4) return 77;
  return 84;
}

function inferTotalSlotsFromTier(bedroomTier) {
  if (bedroomTier <= 1) return 12;
  if (bedroomTier === 2) return 18;
  if (bedroomTier === 3) return 24;
  if (bedroomTier === 4) return 30;
  return 36 + ((bedroomTier - 5) * 6);
}

function inferSlotBasePriceMonthly(bedroomTier) {
  return 500 + ((Math.max(1, bedroomTier) - 1) * 400);
}

function inferPropertyNumericDefaults(propertyLike = {}) {
  const bedroomTier = inferBedroomTier(propertyLike);
  const inferredBeds = bedroomTier;
  const inferredBaths = inferBathsFromTier(bedroomTier);
  const inferredSqft = inferSqftFromTier(bedroomTier);
  const slotBasePriceMonthly = hasPositiveNumber(propertyLike.slotBasePriceMonthly)
    ? roundCurrency(propertyLike.slotBasePriceMonthly)
    : inferSlotBasePriceMonthly(bedroomTier);
  const currentDailyPayoutAmount = hasPositiveNumber(propertyLike.currentDailyPayoutAmount)
    ? roundCurrency(propertyLike.currentDailyPayoutAmount)
    : Math.max(55, roundCurrency(slotBasePriceMonthly * 0.11));
  const projectedMonthlyPayoutAmount = hasPositiveNumber(propertyLike.projectedMonthlyPayoutAmount)
    ? roundCurrency(propertyLike.projectedMonthlyPayoutAmount)
    : roundCurrency(currentDailyPayoutAmount * 30);
  const projectedAnnualPayoutAmount = hasPositiveNumber(propertyLike.projectedAnnualPayoutAmount)
    ? roundCurrency(propertyLike.projectedAnnualPayoutAmount)
    : roundCurrency(projectedMonthlyPayoutAmount * 12);
  const estimatedMonthlyProfit = hasPositiveNumber(propertyLike.estimatedMonthlyProfit)
    ? roundCurrency(propertyLike.estimatedMonthlyProfit)
    : projectedMonthlyPayoutAmount;
  const estimatedQuarterlyProfit = hasPositiveNumber(propertyLike.estimatedQuarterlyProfit)
    ? roundCurrency(propertyLike.estimatedQuarterlyProfit)
    : roundCurrency(estimatedMonthlyProfit * 3);
  const estimatedYearlyProfit = hasPositiveNumber(propertyLike.estimatedYearlyProfit)
    ? roundCurrency(propertyLike.estimatedYearlyProfit)
    : roundCurrency(estimatedMonthlyProfit * 12);
  const totalSlots = hasPositiveNumber(propertyLike.totalSlots)
    ? Math.round(propertyLike.totalSlots)
    : inferTotalSlotsFromTier(bedroomTier);
  const totalValue = hasPositiveNumber(propertyLike.totalValue)
    ? roundCurrency(propertyLike.totalValue)
    : roundCurrency(slotBasePriceMonthly * 180);
  const targetRaiseAmount = hasPositiveNumber(propertyLike.targetRaiseAmount)
    ? roundCurrency(propertyLike.targetRaiseAmount)
    : roundCurrency(slotBasePriceMonthly * totalSlots * 6);
  const expectedAnnualYield = hasPositiveNumber(propertyLike.expectedAnnualYield)
    ? roundCurrency(propertyLike.expectedAnnualYield)
    : inferYieldFromTier(bedroomTier);
  const occupancyScore = hasPositiveNumber(propertyLike.occupancyScore)
    ? Math.min(100, Math.round(propertyLike.occupancyScore))
    : inferOccupancyFromTier(bedroomTier);
  const demandScore = hasPositiveNumber(propertyLike.demandScore)
    ? Math.min(100, Math.round(propertyLike.demandScore))
    : inferDemandFromTier(bedroomTier);
  const targetOccupancyRate = hasPositiveNumber(propertyLike.targetOccupancyRate)
    ? Math.min(100, Math.round(propertyLike.targetOccupancyRate))
    : Math.max(50, occupancyScore - 4);

  return {
    beds: hasPositiveNumber(propertyLike.beds) ? Math.round(propertyLike.beds) : inferredBeds,
    baths: hasPositiveNumber(propertyLike.baths) ? roundCurrency(propertyLike.baths) : inferredBaths,
    sqft: hasPositiveNumber(propertyLike.sqft) ? Math.round(propertyLike.sqft) : inferredSqft,
    totalValue,
    targetRaiseAmount,
    expectedAnnualYield,
    totalSlots,
    slotBasePriceMonthly,
    currentDailyPayoutAmount,
    projectedMonthlyPayoutAmount,
    projectedAnnualPayoutAmount,
    estimatedMonthlyProfit,
    estimatedQuarterlyProfit,
    estimatedYearlyProfit,
    occupancyScore,
    demandScore,
    targetOccupancyRate,
  };
}

function pickBlankInferredFields(propertyLike = {}, inferredValues = {}) {
  return Object.fromEntries(
    Object.entries(inferredValues).filter(([key]) => isBlankAutofillValue(propertyLike[key]))
  );
}

module.exports = {
  hasPositiveNumber,
  hasNonNegativeNumber,
  inferPropertyNumericDefaults,
  isBlankAutofillValue,
  pickBlankInferredFields,
};