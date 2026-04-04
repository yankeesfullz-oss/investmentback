const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');

const env = require('./config/env');
const logger = require('./middleware/logger');
const rateLimiter = require('./middleware/rateLimiter');
const errorHandler = require('./middleware/errorHandler');

const authRoutes = require('./routes/auth.routes');
const userRoutes = require('./routes/user.routes');
const walletRoutes = require('./routes/wallet.routes');
const depositRoutes = require('./routes/deposit.routes');
const withdrawalRoutes = require('./routes/withdrawal.routes');
const propertyRoutes = require('./routes/property.routes');
const investmentRoutes = require('./routes/investment.routes');
const bookingRoutes = require('./routes/booking.routes');
const payoutRoutes = require('./routes/payout.routes');
const chatRoutes = require('./routes/chat.routes');

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

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/wallets', walletRoutes);
app.use('/api/deposits', depositRoutes);
app.use('/api/withdrawals', withdrawalRoutes);
app.use('/api/properties', propertyRoutes);
app.use('/api/investments', investmentRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/payouts', payoutRoutes);
app.use('/api/chat', chatRoutes);

app.use(errorHandler);

module.exports = app;
