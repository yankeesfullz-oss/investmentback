const User = require('../models/User');
const { provisionUserWallets } = require('../services/wallet.service');
const { signToken } = require('../utils/jwt');

function buildAuthResponse(user) {
  const token = signToken({
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
  });

  return {
    token,
    user: {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      lastLoginAt: user.lastLoginAt,
    },
  };
}

async function investorSignup(req, res, next) {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const fullName = String(req.body.fullName || '').trim();
    const password = String(req.body.password || '');

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({ message: 'An account already exists for this email address' });
    }

    const user = await User.create({
      email,
      fullName,
      password,
      role: 'investor',
      lastLoginAt: new Date(),
    });

    await provisionUserWallets(user.id);

    return res.status(201).json(buildAuthResponse(user));
  } catch (error) {
    return next(error);
  }
}

async function investorLogin(req, res, next) {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');

    const user = await User.findOne({ email, role: 'investor' }).select('+password');
    if (!user || !user.password) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const passwordMatches = await user.comparePassword(password);
    if (!passwordMatches) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    user.lastLoginAt = new Date();
    await user.save();

    return res.status(200).json(buildAuthResponse(user));
  } catch (error) {
    return next(error);
  }
}

async function adminLogin(req, res, next) {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    const user = await User.findOne({ email, role: 'admin' }).select('+password');
    if (!user || !user.password) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const passwordMatches = await user.comparePassword(password);
    if (!passwordMatches) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    user.lastLoginAt = new Date();
    await user.save();

    return res.status(200).json(buildAuthResponse(user));
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  investorSignup,
  investorLogin,
  adminLogin,
};