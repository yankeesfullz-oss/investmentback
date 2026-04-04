const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');

const env = require('./config/env');
const logger = require('./middleware/logger');
const rateLimiter = require('./middleware/rateLimiter');
const errorHandler = require('./middleware/errorHandler');

function safeRequire(modulePath) {
  try {
    return require(modulePath);
  } catch (error) {
    if (error && error.code === 'MODULE_NOT_FOUND') {
      console.warn(`[startup] Skipping optional module ${modulePath}: ${error.message}`);
      return null;
    }

    throw error;
  }
}

const authRoutes = safeRequire('./routes/auth.routes');
const userRoutes = safeRequire('./routes/user.routes');
const walletRoutes = safeRequire('./routes/wallet.routes');
const depositRoutes = safeRequire('./routes/deposit.routes');
const withdrawalRoutes = safeRequire('./routes/withdrawal.routes');
const propertyRoutes = safeRequire('./routes/property.routes');
const investmentRoutes = safeRequire('./routes/investment.routes');
const bookingRoutes = safeRequire('./routes/booking.routes');
const payoutRoutes = safeRequire('./routes/payout.routes');
const chatRoutes = safeRequire('./routes/chat.routes');

const app = express();

app.use(helmet());
// Configure CORS: allow all in development, otherwise restrict to allowed origins
const corsOptions = {
  origin: function (origin, cb) {
    if (env.nodeEnv === 'development') return cb(null, true);
    // Allow requests with no origin (e.g., server-to-server, curl)
    if (!origin) return cb(null, true);
    if (env.allowedOrigins && env.allowedOrigins.indexOf(origin) !== -1) {
      return cb(null, true);
    }
    return cb(new Error('Not allowed by CORS'));
  },
  credentials: true,
};
app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(logger);
app.use(rateLimiter);

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', service: 'investair-backend' });
});

const routeRegistry = [
  ['/api/auth', authRoutes],
  ['/api/users', userRoutes],
  ['/api/wallets', walletRoutes],
  ['/api/deposits', depositRoutes],
  ['/api/withdrawals', withdrawalRoutes],
  ['/api/properties', propertyRoutes],
  ['/api/investments', investmentRoutes],
  ['/api/bookings', bookingRoutes],
  ['/api/payouts', payoutRoutes],
  ['/api/chat', chatRoutes],
];

routeRegistry.forEach(([basePath, router]) => {
  if (router) {
    app.use(basePath, router);
  }
});

app.use(errorHandler);

module.exports = app;
