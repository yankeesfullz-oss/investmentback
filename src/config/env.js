const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ override: true });

module.exports = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 5000,
  mongodbUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/investair',
  jwtSecret: process.env.JWT_SECRET || 'change-me',
  clientUrl: process.env.CLIENT_URL || 'http://localhost:3000',
  encryptionKey: process.env.ENCRYPTION_KEY || 'replace-with-32-char-key',
  walletMnemonic: process.env.MNEMONIC || process.env.MNEMONIC_PHRASE || process.env.SEED || '',
  walletMnemonicPassphrase: process.env.MNEMONIC_PASSPHRASE || '',
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  geminiModel: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
  chatKnowledgeBasePath: process.env.CHAT_KNOWLEDGE_BASE_PATH || path.resolve(__dirname, '../../../investment/chatbot-knowledge-base.txt'),
  chatMaxImageBytes: Number(process.env.CHAT_MAX_IMAGE_BYTES) || 5 * 1024 * 1024,
  chatMaxHistoryMessages: Number(process.env.CHAT_MAX_HISTORY_MESSAGES) || 20,
};
