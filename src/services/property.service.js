const Property = require('../models/Property');
const { checkSlotAvailability } = require('./investment.service');
const {
  coerceDurationBounds,
  resolveAllowedDurations,
} = require('../utils/propertyDurationUtils');
const { autofillPropertyDraft } = require('./propertyAutofill.service');
const {
  inferPropertyNumericDefaults,
  pickBlankInferredFields,
} = require('../utils/propertyInferenceUtils');

function createHttpError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

async function listProperties(filter = {}) {
  return Property.find(filter).sort({ createdAt: -1 });
}

async function getPropertyById(propertyId) {
  const property = await Property.findById(propertyId);

  if (!property) {
    throw createHttpError('Property not found', 404);
  }

  return property;
}

function buildNormalizedPropertyPayload(payload, existingProperty = null) {
  const safePayload = payload && typeof payload === 'object' ? payload : {};
  const merged = existingProperty
    ? { ...existingProperty.toObject(), ...safePayload }
    : safePayload;
  const inferredNumericFields = pickBlankInferredFields(merged, inferPropertyNumericDefaults(merged));

  return {
    ...safePayload,
    ...coerceDurationBounds(merged),
    ...inferredNumericFields,
  };
}

async function createProperty(payload) {
  return Property.create(buildNormalizedPropertyPayload(payload));
}

async function updateProperty(propertyId, payload) {
  const existingProperty = await Property.findById(propertyId);

  if (!existingProperty) {
    throw createHttpError('Property not found', 404);
  }

  const property = await Property.findByIdAndUpdate(propertyId, buildNormalizedPropertyPayload(payload, existingProperty), {
    new: true,
    runValidators: true,
  });

  return property;
}

async function autofillDraft(payload, options = {}) {
  return autofillPropertyDraft(buildNormalizedPropertyPayload(payload), options);
}

async function deleteProperty(propertyId) {
  const property = await Property.findByIdAndDelete(propertyId);

  if (!property) {
    throw createHttpError('Property not found', 404);
  }

  return property;
}

function addMonths(startDate, durationMonths) {
  const endDate = new Date(startDate);
  endDate.setUTCMonth(endDate.getUTCMonth() + durationMonths);
  endDate.setUTCDate(endDate.getUTCDate() - 1);
  return endDate;
}

function hasBlockedDateOverlap(blockedDates, startDate, endDate) {
  return Array.isArray(blockedDates) && blockedDates.some((blockedDate) => {
    const blockedStart = new Date(blockedDate.startDate);
    const blockedEnd = new Date(blockedDate.endDate);

    if (Number.isNaN(blockedStart.getTime()) || Number.isNaN(blockedEnd.getTime())) {
      return false;
    }

    return blockedStart <= endDate && blockedEnd >= startDate;
  });
}

async function listBestInvestmentOptions(options = {}) {
  const minOccupancy = Number(options.minOccupancy || 90);
  const limit = Math.max(1, Math.min(Number(options.limit || 3), 10));
  const now = new Date();
  const candidates = await Property.find({
    occupancyScore: { $gte: minOccupancy },
    investmentStatus: 'active',
    availableUnits: { $gt: 0 },
  }).sort({ occupancyScore: -1, projectedAnnualPayoutAmount: -1, createdAt: -1 });

  const recommended = [];

  for (const property of candidates) {
    const startDate = property.nextAvailableStartDate ? new Date(property.nextAvailableStartDate) : new Date(now);
    if (Number.isNaN(startDate.getTime())) {
      continue;
    }

    const normalizedStart = startDate < now ? new Date(now) : startDate;
    normalizedStart.setUTCHours(0, 0, 0, 0);

    const durationMonths = resolveAllowedDurations(property)[0] || 1;
    const endDate = addMonths(normalizedStart, durationMonths);

    if (hasBlockedDateOverlap(property.blockedDates, normalizedStart, endDate)) {
      continue;
    }

    const slotAvailable = await checkSlotAvailability(property.id, normalizedStart, endDate);
    if (!slotAvailable) {
      continue;
    }

    recommended.push({
      property,
      recommendedDurationMonths: durationMonths,
      bestInvestmentOption: true,
    });

    if (recommended.length >= limit) {
      break;
    }
  }

  return recommended;
}

module.exports = {
  listProperties,
  getPropertyById,
  createProperty,
  updateProperty,
  autofillDraft,
  deleteProperty,
  listBestInvestmentOptions,
};
