const http = require('http');

const app = require('./app');
const env = require('./config/env');
const connectDatabase = require('./config/database');
const { initializeSocket } = require('./config/socket');
const setupSocketHandlers = require('./realtime/socketHandlers');

async function startServer() {
  await connectDatabase();

  const server = http.createServer(app);
  const io = initializeSocket(server, {
    cors: {
      origin: env.nodeEnv === 'development' ? true : env.allowedOrigins,
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
