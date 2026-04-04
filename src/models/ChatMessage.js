const mongoose = require('mongoose');

const attachmentSchema = new mongoose.Schema(
  {
    fileName: { type: String, default: '' },
    mimeType: { type: String, default: '' },
    size: { type: Number, default: 0 },
  },
  { _id: false }
);

const actionSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['navigate', 'live-agent'], default: 'navigate' },
    label: { type: String, required: true },
    url: { type: String, default: '' },
  },
  { _id: false }
);

const propertyRecommendationSchema = new mongoose.Schema(
  {
    property: { type: mongoose.Schema.Types.ObjectId, ref: 'Property', required: true },
    name: { type: String, default: '' },
    location: { type: String, default: '' },
    bestInvestmentOption: { type: Boolean, default: false },
    occupancyScore: { type: Number, default: 0 },
    availableUnits: { type: Number, default: 0 },
    recommendedDurationMonths: { type: Number, default: 0 },
  },
  { _id: false }
);

const chatMessageSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    sessionId: { type: String, default: '', index: true },
    role: { type: String, enum: ['user', 'assistant'], required: true },
    content: { type: String, required: true, trim: true },
    escalationRequested: { type: Boolean, default: false },
    liveSupportOffered: { type: Boolean, default: false },
    attachments: { type: [attachmentSchema], default: [] },
    actions: { type: [actionSchema], default: [] },
    faqSuggestions: { type: [String], default: [] },
    recommendedProperties: { type: [propertyRecommendationSchema], default: [] },
  },
  { timestamps: true }
);

module.exports = mongoose.model('ChatMessage', chatMessageSchema);