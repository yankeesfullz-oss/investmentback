const { generateChatResponse } = require('./gemini.service');
const { normalizeAllowedDurations } = require('../utils/propertyDurationUtils');
const {
  inferPropertyNumericDefaults,
  isBlankAutofillValue,
  pickBlankInferredFields,
} = require('../utils/propertyInferenceUtils');

const AUTOFILLABLE_FIELDS = [
  'market',
  'propertyType',
  'listingType',
  'investorHeadline',
  'investorSummary',
  'description',
  'highlights',
  'trustBadges',
  'tags',
  'availabilityWindowLabel',
];
const NUMERIC_AUTOFILLABLE_FIELDS = [
  'beds',
  'baths',
  'sqft',
  'totalValue',
  'targetRaiseAmount',
  'expectedAnnualYield',
  'totalSlots',
  'slotBasePriceMonthly',
  'currentDailyPayoutAmount',
  'projectedMonthlyPayoutAmount',
  'projectedAnnualPayoutAmount',
  'occupancyScore',
  'demandScore',
];

function parseJsonResponse(rawText, correlationId) {
  const text = String(rawText || '').trim();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    // Try to extract a JSON object or array embedded in the response
    const jsonMatch = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);

    if (!jsonMatch) {
      if (correlationId) {
        console.error(`[autofill:${correlationId}] Gemini response not parseable as JSON (preview): ${String(text).slice(0,1000)}`);
      }
      return null;
    }

    try {
      return JSON.parse(jsonMatch[0]);
    } catch (e) {
      if (correlationId) {
        console.error(`[autofill:${correlationId}] Failed parsing extracted JSON (preview): ${String(jsonMatch[0]).slice(0,1000)}`);
      }
      return null;
    }
  }
}

function compactStringList(value, limit = 8) {
  const source = Array.isArray(value)
    ? value
    : String(value || '')
      .split(/[\n,]/);

  return [...new Set(
    source
      .map((entry) => String(entry || '').trim())
      .filter(Boolean)
  )].slice(0, limit);
}

function isBlankValue(value) {
  if (Array.isArray(value)) {
    return value.length === 0;
  }

  return String(value || '').trim() === '';
}

function sanitizeFilledFields(draft, candidate) {
  const safeDraft = draft && typeof draft === 'object' ? draft : {};
  const safeCandidate = candidate && typeof candidate === 'object' ? candidate : {};
  const result = {};

  for (const field of AUTOFILLABLE_FIELDS) {
    if (!isBlankValue(safeDraft[field])) {
      continue;
    }

    const value = safeCandidate[field];
    if (value === undefined || value === null) {
      continue;
    }

    if (['highlights', 'trustBadges', 'tags'].includes(field)) {
      const normalizedList = compactStringList(value);
      if (normalizedList.length > 0) {
        result[field] = normalizedList;
      }
      continue;
    }

    const normalized = String(value || '').trim();
    if (normalized) {
      result[field] = normalized;
    }
  }

  for (const field of NUMERIC_AUTOFILLABLE_FIELDS) {
    if (!isBlankAutofillValue(safeDraft[field])) {
      continue;
    }

    const value = Number(safeCandidate[field]);
    if (Number.isFinite(value) && value > 0) {
      result[field] = value;
    }
  }

  if (isBlankValue(safeDraft.allowedDurations) && safeCandidate.allowedDurations !== undefined) {
    const allowedDurations = normalizeAllowedDurations(safeCandidate.allowedDurations);
    if (allowedDurations.length > 0) {
      result.allowedDurations = allowedDurations;
    }
  }

  return result;
}

function buildPromptContext(draft) {
  return {
    name: String(draft.name || '').trim(),
    location: String(draft.location || '').trim(),
    addressLine1: String(draft.addressLine1 || '').trim(),
    city: String(draft.city || '').trim(),
    state: String(draft.state || '').trim(),
    postalCode: String(draft.postalCode || '').trim(),
    country: String(draft.country || '').trim(),
    market: String(draft.market || '').trim(),
    propertyType: String(draft.propertyType || '').trim(),
    listingType: String(draft.listingType || '').trim(),
    beds: draft.beds ?? '',
    baths: draft.baths ?? '',
    sqft: draft.sqft ?? '',
    yearBuilt: draft.yearBuilt ?? '',
    totalValue: draft.totalValue ?? '',
    expectedAnnualYield: draft.expectedAnnualYield ?? '',
    occupancyScore: draft.occupancyScore ?? '',
    demandScore: draft.demandScore ?? '',
    sourceName: String(draft.sourceName || '').trim(),
    sourceUrl: String(draft.sourceUrl || '').trim(),
    sourceListingId: String(draft.sourceListingId || '').trim(),
    coverImage: String(draft.coverImage || '').trim(),
    highlights: compactStringList(draft.highlights),
    trustBadges: compactStringList(draft.trustBadges),
    tags: compactStringList(draft.tags),
    description: String(draft.description || '').trim(),
    investorHeadline: String(draft.investorHeadline || '').trim(),
    investorSummary: String(draft.investorSummary || '').trim(),
    availabilityWindowLabel: String(draft.availabilityWindowLabel || '').trim(),
    allowedDurations: normalizeAllowedDurations(draft.allowedDurations),
  };
}

async function autofillPropertyDraft(draft, options = {}) {
  const promptContext = buildPromptContext(draft);
  const heuristicFields = pickBlankInferredFields(draft, inferPropertyNumericDefaults(draft));
  const missingFields = AUTOFILLABLE_FIELDS.filter((field) => isBlankValue(promptContext[field]));
  const missingInvestorCopyFields = ['investorHeadline', 'investorSummary'].filter((field) => isBlankValue(promptContext[field]));

  if (!promptContext.name && !promptContext.location && !promptContext.addressLine1) {
    throw new Error('Add at least a property name or location before using Fill blanks');
  }

  const systemPrompt = [
    'You are assisting an investment property admin form.',
    'Infer only missing property marketing metadata from the provided draft.',
    'Return JSON only with any of these keys when you can infer them confidently:',
    AUTOFILLABLE_FIELDS.join(', '),
    'Optional key: allowedDurations as an array of whole numbers between 1 and 24.',
    'Numeric pricing and payout fields are handled by deterministic heuristics and should not be rewritten.',
    'Do not invent legal claims, certifications, exact financial guarantees, or unverifiable facts.',
    'Prefer conservative, neutral real-estate marketing copy.',
    'When generating investorHeadline or investorSummary, write for investors evaluating an income-producing asset, not for guests booking a stay.',
    'Use the property description as the primary source for investor copy. Use location, market, layout, demand, and payout context only as supporting evidence.',
    'Avoid vacation language, hospitality fluff, generic luxury adjectives, and direct promises of returns.',
    'investorHeadline should be a concise investor-facing line of roughly 6 to 12 words.',
    'investorSummary should be 1 to 3 sentences that frame the opportunity in terms of asset context, demand signals, operational profile, or managed cashflow potential without making guarantees.',
    'If the property description is missing or too thin to support investor-facing copy, omit investorHeadline and investorSummary.',
    'highlights, trustBadges, and tags must be arrays of short strings.',
  ].join(' ');

  const userPrompt = [
    'Analyze this property draft and fill only the missing fields you can infer with reasonable confidence.',
    'Existing non-blank fields are authoritative and must not be rewritten.',
    'Use the provided heuristic estimates as supporting context for the marketing copy.',
    'If you are unsure, omit the field entirely.',
    `Missing autofill fields: ${missingFields.join(', ') || 'none'}.`,
    missingInvestorCopyFields.length > 0
      ? `Draft ${missingInvestorCopyFields.join(' and ')} from the property description first, then use grounded property facts to support the investor angle.`
      : 'Do not rewrite existing investor headline or investor summary fields.',
    'If you generate investor-facing copy, make it useful for an investor evaluating demand, positioning, and operating potential rather than a traveler choosing a stay.',
    'Heuristic estimates JSON:',
    JSON.stringify(heuristicFields, null, 2),
    '',
    'Draft JSON:',
    JSON.stringify(promptContext, null, 2),
  ].join('\n\n');

  let aiFields = {};
  let partial = false;

  const correlationId = options.correlationId || `${Date.now().toString(36)}-${Math.random().toString(16).slice(2,8)}`;

  try {
    const rawResponse = await generateChatResponse({
      systemPrompt,
      userPrompt,
      generationConfig: {
        temperature: 0.3,
        topP: 0.9,
        maxOutputTokens: 1200,
      },
      debug: { correlationId },
    });
    const parsed = parseJsonResponse(rawResponse, correlationId);

    if (parsed) {
      aiFields = sanitizeFilledFields(promptContext, parsed);
    } else {
      partial = true;
      console.error(`[autofill:${correlationId}] Gemini returned malformed or non-JSON output (preview): ${String(rawResponse).slice(0,1200)}`);
    }
  } catch (error) {
    console.error(`[autofill:${correlationId}] Exception while calling Gemini:`, error?.message || error);

    if (Object.keys(heuristicFields).length === 0) {
      // No heuristics to fall back to — surface the error including correlationId
      const err = new Error(`[autofill:${correlationId}] ${error?.message || 'Gemini request failed'}`);
      throw err;
    }
  }

  return {
    fields: {
      ...heuristicFields,
      ...aiFields,
    },
    partial,
    correlationId,
  };
}

module.exports = {
  AUTOFILLABLE_FIELDS,
  autofillPropertyDraft,
};