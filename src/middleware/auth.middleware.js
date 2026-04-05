const env = require('../config/env');
const User = require('../models/User');
const { verifyToken } = require('../utils/jwt');

async function resolveAuth0User(token) {
  if (!env.auth0Domain) {
    throw new Error('Invalid token');
  }

  const response = await fetch(`https://${env.auth0Domain}/userinfo`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error('Invalid token');
  }

  const profile = await response.json();
  const normalizedEmail = String(profile.email || '').trim().toLowerCase();

  if (!profile.sub && !normalizedEmail) {
    throw new Error('Invalid token');
  }

  let user = await User.findOne({
    $or: [
      ...(profile.sub ? [{ auth0Sub: profile.sub }] : []),
      ...(normalizedEmail ? [{ email: normalizedEmail }] : []),
    ],
  });

  if (!user) {
    if (!normalizedEmail) {
      throw new Error('Invalid token');
    }

    user = await User.create({
      auth0Sub: profile.sub || '',
      email: normalizedEmail,
      fullName: profile.name || profile.nickname || normalizedEmail,
      role: 'investor',
      lastLoginAt: new Date(),
    });
  } else {
    let shouldSave = false;

    if (profile.sub && user.auth0Sub !== profile.sub) {
      user.auth0Sub = profile.sub;
      shouldSave = true;
    }

    if (!user.fullName && (profile.name || profile.nickname)) {
      user.fullName = profile.name || profile.nickname;
      shouldSave = true;
    }

    if (normalizedEmail && user.email !== normalizedEmail) {
      user.email = normalizedEmail;
      shouldSave = true;
    }

    user.lastLoginAt = new Date();
    shouldSave = true;

    if (shouldSave) {
      await user.save();
    }
  }

  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    auth0Sub: user.auth0Sub,
    lastLoginAt: user.lastLoginAt,
  };
}

module.exports = async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

  if (!token) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  try {
    req.user = verifyToken(token);
    return next();
  } catch (error) {
    try {
      req.user = await resolveAuth0User(token);
      return next();
    } catch (auth0Error) {
      return res.status(401).json({ message: 'Invalid token' });
    }
  }
};
