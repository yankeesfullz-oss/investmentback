const jwt = require('jsonwebtoken');

const env = require('../config/env');

function signToken(payload, options = {}) {
  return jwt.sign(payload, env.jwtSecret, { expiresIn: '7d', ...options });
}

function verifyToken(token, options = {}) {
  return jwt.verify(token, env.jwtSecret, options);
}

module.exports = {
  signToken,
  verifyToken,
};
