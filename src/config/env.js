const dotenv = require('dotenv');
const path = require('path');

dotenv.config();

function parseAllowedOrigins() {
  const raw = process.env.ALLOWED_ORIGINS || process.env.CLIENT_URL || 'http://localhost:3000';
  return raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

function assertProductionConfig(env) {
  if (env.nodeEnv !== 'production') return;

  const missing = [];
  if (!process.env.MONGODB_URI) missing.push('MONGODB_URI');
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'change-me') missing.push('JWT_SECRET');
  if (!process.env.CLIENT_URL) missing.push('CLIENT_URL');
  if (!process.env.ENCRYPTION_KEY || process.env.ENCRYPTION_KEY === 'replace-with-32-char-key') missing.push('ENCRYPTION_KEY');

  if (missing.length > 0) {
    throw new Error(`Missing required production environment variables: ${missing.join(', ')}`);
  }

  if (env.walletMnemonic && !env.walletMnemonicPassphrase) {
    throw new Error('MNEMONIC_PASSPHRASE is required in production when MNEMONIC is set.');
  }
}

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 5000,
  mongodbUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/investair',
  jwtSecret: process.env.JWT_SECRET || 'change-me',
  clientUrl: process.env.CLIENT_URL || 'http://localhost:3000',
  // Comma-separated list of allowed origins for CORS. Example: "https://example.com,https://app.example.com"
  allowedOrigins: parseAllowedOrigins(),
  encryptionKey: process.env.ENCRYPTION_KEY || 'replace-with-32-char-key',
  walletMnemonic: process.env.MNEMONIC || process.env.MNEMONIC_PHRASE || process.env.SEED || '',
  walletMnemonicPassphrase: process.env.MNEMONIC_PASSPHRASE ? process.env.MNEMONIC_PASSPHRASE.trim() : undefined,
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  geminiModel: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
  chatKnowledgeBasePath: process.env.CHAT_KNOWLEDGE_BASE_PATH || path.resolve(__dirname, '../../../investair/chatbot-knowledge-base.txt'),
  chatMaxImageBytes: Number(process.env.CHAT_MAX_IMAGE_BYTES) || 5 * 1024 * 1024,
  chatMaxHistoryMessages: Number(process.env.CHAT_MAX_HISTORY_MESSAGES) || 20,
};

assertProductionConfig(env);

module.exports = env;
