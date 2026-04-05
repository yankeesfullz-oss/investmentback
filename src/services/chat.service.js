const fs = require('fs/promises');

const env = require('../config/env');
const ChatMessage = require('../models/ChatMessage');
const User = require('../models/User');
const Wallet = require('../models/Wallet');
const { listBestInvestmentOptions } = require('./property.service');
const { generateChatResponse } = require('./gemini.service');
const notificationService = require('./notification.service');

let cachedKnowledgeBase = null;
const ESCALATION_PATTERN = /\b(agent|human|live\s+support|talk\s+to\s+agent|help\s+me|confused|support)\b/i;
const KB_SECTION_PATTERN = /={10,}\n([^\n]+)\n={10,}\n([\s\S]*?)(?=\n={10,}\n[^\n]+\n={10,}\n|$)/g;

const TOPIC_KEYWORDS = {
  signup: ['sign up', 'signup', 'register', 'registration', 'create account'],
  login: ['login', 'log in', 'sign in'],
  funding: ['fund', 'deposit', 'wallet', 'btc', 'eth', 'usdt', 'address'],
  screenshot: ['screenshot', 'screen shot', 'image', 'upload', 'error'],
  browse: ['browse', 'search', 'city', 'marketplace', 'listing', 'property'],
  bestOption: ['best investment', 'best option', 'best properties', 'occupancy', 'recommend'],
  invest: ['invest', 'checkout', 'duration', 'slot'],
  dashboard: ['dashboard', 'balance', 'locked', 'activity'],
  payout: ['payout', 'profit', 'earnings'],
  withdraw: ['withdraw', 'withdrawal', 'cash out'],
  overview: ['invest air', 'investair', 'about', 'what is', 'tell me about'],
};

function createHttpError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

async function getKnowledgeBase() {
  if (cachedKnowledgeBase) {
    return cachedKnowledgeBase;
  }

  cachedKnowledgeBase = await fs.readFile(env.chatKnowledgeBasePath, 'utf8');
  return cachedKnowledgeBase;
}

async function getInvestorContext(userId) {
  const [user, wallets] = await Promise.all([
    User.findById(userId).select('-password'),
    Wallet.find({ user: userId }).sort({ currency: 1 }),
  ]);

  if (!user) {
    throw createHttpError('Investor not found', 404);
  }

  const walletSummary = wallets.map((wallet) => ({
    currency: wallet.currency,
    availableBalance: Number(wallet.availableBalance || 0),
    lockedBalance: Number(wallet.lockedBalance || 0),
    profitBalance: Number(wallet.profitBalance || 0),
    address: wallet.address,
  }));
  const availableBalance = walletSummary.reduce((sum, wallet) => sum + wallet.availableBalance, 0);

  return {
    user,
    wallets: walletSummary,
    readiness: availableBalance > 0 ? 'ready_to_invest' : 'needs_deposit',
  };
}

function buildActions(context) {
  return buildActionsWithOptions(context);
}

function buildActionsWithOptions(context, options = {}) {
  const { includeDepositFunds = false } = options;
  const actions = [
    { type: 'navigate', label: 'Invest Now', url: '/invest' },
    { type: 'navigate', label: 'View Wallet', url: '/investor/dashboard#wallets' },
    { type: 'navigate', label: 'Withdraw', url: '/investor/withdrawals' },
    { type: 'live-agent', label: 'Talk to Live Agent', url: '' },
  ];

  if (includeDepositFunds || context.readiness === 'needs_deposit') {
    actions.unshift({ type: 'navigate', label: 'Deposit Funds', url: '/investor/dashboard#fund-account' });
  }

  return actions;
}

function detectEscalationIntent(message) {
  return ESCALATION_PATTERN.test(String(message || ''));
}

function normalizeSessionId(userId, sessionId) {
  const normalized = String(sessionId || '').trim();
  return normalized || `chat-${userId}-${new Date().toISOString().slice(0, 10)}`;
}

function buildFaqSuggestions(message) {
  const lower = String(message || '').toLowerCase();

  if (lower.includes('screenshot') || lower.includes('error')) {
    return [
      'How do I fund my account?',
      'How do I invest?',
      'How do withdrawals work?',
    ];
  }

  if (lower.includes('best') || lower.includes('property') || lower.includes('invest')) {
    return [
      'Which properties are the best investment options right now?',
      'How do I invest?',
      'How do I fund my account?',
    ];
  }

  return [
    'How do I fund my account?',
    'How do I invest?',
    'Can I send a screenshot for help?',
  ];
}

async function getRecommendedProperties(message) {
  const normalized = String(message || '').toLowerCase();
  if (!/(best|recommend|property|invest|opportunity|occupancy)/.test(normalized)) {
    return [];
  }

  const recommendations = await listBestInvestmentOptions({ minOccupancy: 90, limit: 3 });
  return recommendations.map(({ property, recommendedDurationMonths, bestInvestmentOption }) => ({
    property: property._id,
    name: property.name,
    location: property.location,
    occupancyScore: Number(property.occupancyScore || 0),
    availableUnits: Number(property.availableUnits || 0),
    recommendedDurationMonths,
    bestInvestmentOption,
    payoutCurrency: property.payoutCurrency,
    projectedMonthlyPayoutAmount: Number(property.projectedMonthlyPayoutAmount || 0),
    coverImage: property.coverImage,
  }));
}

function normalizeWhitespace(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function getTopicMatches(message) {
  const normalized = normalizeWhitespace(message).toLowerCase();

  return Object.entries(TOPIC_KEYWORDS)
    .filter(([, keywords]) => keywords.some((keyword) => normalized.includes(keyword)))
    .map(([topic]) => topic);
}

function parseKnowledgeBaseSections(knowledgeBase) {
  const sections = [];
  let match;

  while ((match = KB_SECTION_PATTERN.exec(knowledgeBase)) !== null) {
    sections.push({
      title: normalizeWhitespace(match[1]),
      content: String(match[2] || '').trim(),
    });
  }

  return sections;
}

function scoreSection(section, message, topicMatches) {
  const haystack = `${section.title}\n${section.content}`.toLowerCase();
  let score = 0;

  topicMatches.forEach((topic) => {
    score += haystack.includes(topic.toLowerCase()) ? 8 : 0;
    (TOPIC_KEYWORDS[topic] || []).forEach((keyword) => {
      if (haystack.includes(keyword)) {
        score += 4;
      }
    });
  });

  normalizeWhitespace(message).toLowerCase().split(' ').forEach((token) => {
    if (token.length > 3 && haystack.includes(token)) {
      score += 1;
    }
  });

  return score;
}

function getRelevantKnowledge(knowledgeBase, message) {
  const sections = parseKnowledgeBaseSections(knowledgeBase);
  const topicMatches = getTopicMatches(message);
  const scoredSections = sections
    .map((section) => ({
      ...section,
      score: scoreSection(section, message, topicMatches),
    }))
    .sort((left, right) => right.score - left.score);

  const selected = scoredSections.filter((section) => section.score > 0).slice(0, 3);
  if (selected.length === 0) {
    return sections.slice(0, 2);
  }

  return selected;
}

function extractQaAnswer(content, questionPrefix) {
  const escaped = questionPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`Q:\\s*${escaped}\\s*[\\s\\S]*?A:\\s*([\\s\\S]*?)(?=\\nQ:|$)`,'i');
  const match = content.match(pattern);
  return normalizeWhitespace(match?.[1] || '');
}

function buildKnowledgeFallback(message, context, recommendations, relevantSections) {
  const lower = normalizeWhitespace(message).toLowerCase();
  const sectionText = relevantSections.map((section) => section.content).join('\n\n');
  const intro = context.readiness === 'needs_deposit'
    ? `${context.user.fullName || 'Investor'}, your account is ready, but you need to fund your wallet before you can complete an investment.`
    : `${context.user.fullName || 'Investor'}, your account is active and you can use your available balance to invest.`;

  if (/(sign up|signup|register|registration|create account)/.test(lower)) {
    return extractQaAnswer(sectionText, 'How do I sign up?')
      || 'To sign up, open the investor signup page, enter your email and password, and submit the form. After registration, Investair creates your investor profile, provisions your BTC, ETH, and USDT wallets, and takes you into the investor area.';
  }

  if (/(what is|tell me about|investair|invest air|about)/.test(lower)) {
    return 'Investair is an investment platform for short-term rental property opportunities. Investors can create an account, receive dedicated BTC, ETH, and USDT wallets, fund their balance, choose available property slots, track payouts and activity from the dashboard, request withdrawals, and use the investor-only chatbot for guided help.';
  }

  if (/(best investment|best properties|best option|occupancy|recommend)/.test(lower)) {
    if (recommendations.length > 0) {
      const summary = recommendations
        .map((item) => `${item.name} in ${item.location} with ${item.occupancyScore}% occupancy and ${item.availableUnits} available units`)
        .join('; ');
      return `The best investment options right now are the properties that meet Investair's rule of at least 90% occupancy and current availability. Based on the latest recommendation check, ${summary}. ${intro}`;
    }

    return 'A property is only a best investment option on Investair when it has at least 90% occupancy and is currently available for investment. If no property meets both conditions right now, the chatbot should not label any option as best.';
  }

  if (/(fund|deposit|wallet|btc|eth|usdt|address)/.test(lower)) {
    return 'To fund your account, open the investor dashboard and copy the wallet address for BTC, ETH, or USDT, then send funds from your external wallet. Once the deposit is detected and processed, it becomes available in your Investair balance for investing.';
  }

  if (/(withdraw|withdrawal|cash out)/.test(lower)) {
    return 'To withdraw, open the withdrawals page, enter the amount, currency, network, and destination wallet address, then submit the request. You can follow the request from your withdrawal history and status updates in the investor area.';
  }

  if (/(invest|checkout|duration|slot)/.test(lower)) {
    return `${intro} To invest, open a property, click Invest now, choose one of the supported durations, and confirm the investment from your funded wallet. The system checks availability, validates the duration, and verifies that your wallet has enough available balance before creating the investment.`;
  }

  return `${intro} ${normalizeWhitespace(extractQaAnswer(sectionText, 'How do I fund my account?') || 'I can guide you through signup, funding, investing, screenshots, payouts, and withdrawals using the current Investair workflow in the knowledge base.')}`;
}

function buildSystemPrompt({ relevantKnowledge, context, recommendations }) {
  const recommendationText = recommendations.length > 0
    ? recommendations.map((item) => `- ${item.name} | ${item.location} | occupancy ${item.occupancyScore}% | available units ${item.availableUnits} | best option ${item.bestInvestmentOption ? 'yes' : 'no'} | recommended duration ${item.recommendedDurationMonths} months`).join('\n')
    : 'No qualifying best investment options are currently available.';

  return [
    'You are InvestAir AI, an investor-only conversion assistant.',
    'You must answer the user question directly using the supplied knowledge-base excerpts and investor context.',
    'Do not ignore the question and do not reuse a generic status-only reply.',
    'You must follow the knowledge base and never override it.',
    'Keep answers concise, action-oriented, and compliant.',
    'You must only call a property a best investment option when it has occupancyScore >= 90 and is currently available.',
    'You must use screenshots only as guidance context and never imply perfect visual accuracy.',
    'If the user asks about signup, explain signup. If the user asks what Investair is, explain the platform. If the user asks about the best investment options, explain the rule and mention current recommendations when provided.',
    'Avoid filler such as repeating that the investor can invest now unless it directly helps answer the question.',
    'Respond in 2 to 5 sentences. Do not output markdown headings or bullet lists unless necessary.',
    '',
    'Investor context:',
    `Name: ${context.user.fullName || 'Investor'}`,
    `Email: ${context.user.email}`,
    `Status: ${context.readiness}`,
    `Wallets: ${context.wallets.map((wallet) => `${wallet.currency} available ${wallet.availableBalance}, locked ${wallet.lockedBalance}, address ${wallet.address}`).join(' | ')}`,
    '',
    'Recommended properties:',
    recommendationText,
    '',
    'Relevant knowledge-base excerpts:',
    relevantKnowledge.map((section) => `[${section.title}]\n${section.content}`).join('\n\n'),
  ].join('\n');
}

function buildFallbackMessage(context, recommendations) {
  const intro = context.readiness === 'needs_deposit'
    ? `${context.user.fullName || 'Investor'}, your account is set up but you need to fund your wallet before investing.`
    : `${context.user.fullName || 'Investor'}, you already have available wallet balance and can invest now.`;

  if (recommendations.length === 0) {
    return `${intro} I can guide you through deposits, investments, withdrawals, and screenshot-based UI help.`;
  }

  const bestList = recommendations
    .map((item) => `${item.name} (${item.occupancyScore}% occupancy, ${item.availableUnits} units available)`)
    .join(', ');
  return `${intro} Current best investment options are ${bestList}.`;
}

async function listMessages(userId) {
  return ChatMessage.find({ user: userId })
    .sort({ createdAt: -1 })
    .limit(env.chatMaxHistoryMessages)
    .lean();
}

async function listAdminMessages() {
  return ChatMessage.find({})
    .populate('user', 'fullName email role')
    .sort({ createdAt: -1 })
    .limit(Math.max(env.chatMaxHistoryMessages * 10, 200))
    .lean();
}

async function listChatUsers() {
  const rows = await ChatMessage.aggregate([
    { $sort: { createdAt: -1 } },
    {
      $group: {
        _id: '$user',
        messageCount: { $sum: 1 },
        lastMessageAt: { $first: '$createdAt' },
        lastMessagePreview: { $first: '$content' },
        escalationRequested: { $max: { $cond: ['$escalationRequested', 1, 0] } },
        liveSupportOffered: { $max: { $cond: ['$liveSupportOffered', 1, 0] } },
      },
    },
    {
      $lookup: {
        from: 'users',
        localField: '_id',
        foreignField: '_id',
        as: 'user',
      },
    },
    { $unwind: '$user' },
    { $sort: { lastMessageAt: -1 } },
  ]);

  return rows.map((row) => ({
    _id: String(row._id),
    messageCount: Number(row.messageCount || 0),
    lastMessageAt: row.lastMessageAt,
    lastMessagePreview: row.lastMessagePreview || '',
    escalationRequested: Boolean(row.escalationRequested),
    liveSupportOffered: Boolean(row.liveSupportOffered),
    user: {
      _id: String(row.user?._id || ''),
      email: row.user?.email || '',
      fullName: row.user?.fullName || 'Investor',
      role: row.user?.role || 'investor',
      auth0Sub: row.user?.auth0Sub || '',
    },
  }));
}

async function listAdminUserMessages(userId) {
  return ChatMessage.find({ user: userId })
    .populate('user', 'fullName email role auth0Sub')
    .sort({ createdAt: 1 })
    .lean();
}

function serializeAdminMessage(message, user) {
  return {
    _id: String(message._id || message.id || ''),
    sessionId: message.sessionId || '',
    role: message.role,
    content: message.content,
    escalationRequested: Boolean(message.escalationRequested),
    liveSupportOffered: Boolean(message.liveSupportOffered),
    attachments: Array.isArray(message.attachments) ? message.attachments : [],
    actions: Array.isArray(message.actions) ? message.actions : [],
    faqSuggestions: Array.isArray(message.faqSuggestions) ? message.faqSuggestions : [],
    recommendedProperties: Array.isArray(message.recommendedProperties) ? message.recommendedProperties : [],
    createdAt: message.createdAt,
    updatedAt: message.updatedAt,
    user: {
      _id: String(user?._id || user?.id || ''),
      fullName: user?.fullName || 'Investor',
      email: user?.email || '',
      role: user?.role || 'investor',
    },
  };
}

async function createMessage({ userId, content, screenshots = [], sessionId }) {
  const normalizedContent = String(content || '').trim();
  if (!normalizedContent) {
    throw createHttpError('Message content is required', 400);
  }

  const context = await getInvestorContext(userId);
  const normalizedSessionId = normalizeSessionId(userId, sessionId);
  const knowledgeBase = await getKnowledgeBase();
  const relevantKnowledge = getRelevantKnowledge(knowledgeBase, normalizedContent);
  const recommendations = await getRecommendedProperties(normalizedContent);
  const escalationRequested = detectEscalationIntent(normalizedContent);
  const actions = buildActionsWithOptions(context);
  const faqSuggestions = buildFaqSuggestions(normalizedContent);

  const userMessage = await ChatMessage.create({
    user: userId,
    sessionId: normalizedSessionId,
    role: 'user',
    content: normalizedContent,
    escalationRequested,
    attachments: screenshots.map((file) => ({
      fileName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
    })),
  });

  let assistantContent;
  if (escalationRequested) {
    assistantContent = 'I can connect you to a live agent now. I will open live support so a human agent can continue helping you from here.';
  } else {
    try {
      assistantContent = await generateChatResponse({
        systemPrompt: buildSystemPrompt({ relevantKnowledge, context, recommendations }),
        userPrompt: [
          `Investor question: ${normalizedContent}`,
          '',
          'Answer using the relevant knowledge-base excerpts provided in the system instruction.',
          'If the question is about FAQ content, answer that FAQ directly instead of giving a generic portfolio status summary.',
          'Do not mention action buttons explicitly unless it helps the answer.',
        ].join('\n'),
        screenshots: screenshots.map((file) => ({
          mimeType: file.mimetype,
          buffer: file.buffer,
        })),
      });
    } catch (error) {
      console.error('Gemini chat response failed:', error.message);
      assistantContent = buildKnowledgeFallback(normalizedContent, context, recommendations, relevantKnowledge);
    }
  }

  const recommendedProperties = recommendations.map((item) => ({
    property: item.property,
    name: item.name,
    location: item.location,
    bestInvestmentOption: item.bestInvestmentOption,
    occupancyScore: item.occupancyScore,
    availableUnits: item.availableUnits,
    recommendedDurationMonths: item.recommendedDurationMonths,
  }));

  const assistantMessage = await ChatMessage.create({
    user: userId,
    sessionId: normalizedSessionId,
    role: 'assistant',
    content: assistantContent,
    escalationRequested,
    liveSupportOffered: escalationRequested,
    actions,
    faqSuggestions,
    recommendedProperties,
  });

  const adminPayload = {
    sessionId: normalizedSessionId,
    user: {
      _id: String(context.user._id || context.user.id || ''),
      fullName: context.user.fullName || 'Investor',
      email: context.user.email || '',
      role: context.user.role || 'investor',
    },
    messages: [
      serializeAdminMessage(userMessage, context.user),
      serializeAdminMessage(assistantMessage, context.user),
    ],
  };
  notificationService.emitToAdmins('chat_messages_created', adminPayload);

  return {
    id: assistantMessage.id,
    sessionId: normalizedSessionId,
    message: assistantContent,
    actions,
    faqSuggestions,
    recommendedProperties: recommendations,
    liveAgent: {
      offered: escalationRequested,
      autoOpen: escalationRequested,
    },
    context: {
      fullName: context.user.fullName || 'Investor',
      readiness: context.readiness,
      wallets: context.wallets,
    },
  };
}

module.exports = {
  listMessages,
  listAdminMessages,
  listChatUsers,
  listAdminUserMessages,
  createMessage,
};