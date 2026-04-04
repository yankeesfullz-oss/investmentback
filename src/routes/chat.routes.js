const express = require('express');
const multer = require('multer');
const rateLimit = require('express-rate-limit');

const controller = require('../controllers/chat.controller');
const auth = require('../middleware/auth.middleware');
const admin = require('../middleware/admin.middleware');
const env = require('../config/env');

const router = express.Router();

function investorOnly(req, res, next) {
  if (req.user?.role !== 'investor') {
    return res.status(403).json({ message: 'Investor access required' });
  }

  return next();
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: env.chatMaxImageBytes,
    files: 3,
  },
  fileFilter(req, file, callback) {
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.mimetype)) {
      const error = new Error('Only PNG, JPEG, and WEBP screenshots are supported');
      error.statusCode = 400;
      callback(error);
      return;
    }

    callback(null, true);
  },
});

const chatRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many chat requests. Please try again shortly.' },
});

router.get('/messages', auth, investorOnly, chatRateLimiter, controller.listMessages);
router.get('/admin/messages', auth, admin, chatRateLimiter, controller.listAdminMessages);
router.post('/messages', auth, investorOnly, chatRateLimiter, upload.array('screenshots', 3), controller.createMessage);

module.exports = router;