const { GoogleGenerativeAI } = require('@google/generative-ai');

const env = require('../config/env');

const FALLBACK_MODELS = ['gemini-2.5-flash', 'gemini-flash-latest'];

let cachedClient = null;

function getClient() {
  if (!env.geminiApiKey) {
    return null;
  }

  if (!cachedClient) {
    cachedClient = new GoogleGenerativeAI(env.geminiApiKey);
  }

  return cachedClient;
}

function extractResponseText(response) {
  if (!response) {
    return '';
  }

  if (typeof response.text === 'function') {
    return response.text();
  }

  const candidateText = response.candidates
    ?.flatMap((candidate) => candidate.content?.parts || [])
    ?.map((part) => part.text || '')
    ?.join('\n')
    ?.trim();

  return candidateText || '';
}

function sanitizeResponseText(text) {
  return String(text || '')
    .replace(/^```[a-zA-Z]*\n?/, '')
    .replace(/```$/, '')
    .trim();
}

function buildModelCandidates() {
  return [...new Set([env.geminiModel, ...FALLBACK_MODELS].filter(Boolean))];
}

function isModelNotFoundError(error) {
  const message = String(error?.message || '');

  return error?.status === 404
    || message.includes('404')
    || message.includes('not found')
    || message.includes('is not supported for generateContent');
}

async function generateChatResponse({ systemPrompt, userPrompt, screenshots = [], generationConfig = {}, debug = {} }) {
  const client = getClient();
  if (!client) {
    throw new Error('Gemini API key is not configured');
  }
  const parts = [{ text: userPrompt }];

  for (const screenshot of screenshots) {
    parts.push({
      inlineData: {
        mimeType: screenshot.mimeType,
        data: screenshot.buffer.toString('base64'),
      },
    });
  }

  let lastError = null;

  for (const modelName of buildModelCandidates()) {
    try {
      const model = client.getGenerativeModel({
        model: modelName,
        systemInstruction: systemPrompt,
      });

      const result = await model.generateContent({
        contents: [{ role: 'user', parts }],
        generationConfig: {
          temperature: 0.4,
          topP: 0.9,
          maxOutputTokens: 500,
          ...generationConfig,
        },
      });
      const rawExtracted = extractResponseText(result.response) || '';

      if (debug?.correlationId) {
        // Log a preview of the raw AI output for debugging (no secrets expected here)
        console.error(`[autofill:${debug.correlationId}] Gemini raw output (preview): ${String(rawExtracted).slice(0,1200)}`);
      }

      const text = sanitizeResponseText(rawExtracted);

      if (!text) {
        throw new Error(`Gemini returned an empty response for model ${modelName}`);
      }

      return text;
    } catch (error) {
      lastError = error;

      if (!isModelNotFoundError(error)) {
        throw error;
      }
    }
  }

  throw lastError || new Error('Gemini request failed');
}

module.exports = {
  generateChatResponse,
};