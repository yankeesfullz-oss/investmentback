const http = require('http');

const app = require('./app');
const env = require('./config/env');
const connectDatabase = require('./config/database');
const { initializeSocket } = require('./config/socket');
const setupSocketHandlers = require('./realtime/socketHandlers');

async function startServer() {
  // Production safety checks for required secrets
  if (env.nodeEnv === 'production') {
    if (env.walletMnemonic && (env.walletMnemonicPassphrase === undefined || env.walletMnemonicPassphrase === '')) {
      console.error('MNEMONIC_PASSPHRASE is required in production when MNEMONIC is set. Set the MNEMONIC_PASSPHRASE environment variable.');
      process.exit(1);
    }
  }
  await connectDatabase();

  const server = http.createServer(app);
  const io = initializeSocket(server, {
    cors: {
      origin: env.clientUrl,
      credentials: true,
    },
  });

  setupSocketHandlers(io);

  server.on('error', (err) => {
    if (err && err.code === 'EADDRINUSE') {
      console.error(`Port ${env.port} is already in use. Set PORT to a different value or stop the process using the port.`);
      process.exit(1);
    }
    console.error('Server error:', err);
    process.exit(1);
  });

  server.listen(env.port, () => {
    console.log(`InvestAir backend running on port ${env.port}`);
  });
}

startServer().catch((error) => {
  console.error('Failed to start server', error);
  process.exit(1);
});
