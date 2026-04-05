const bcrypt = require('bcryptjs');

const User = require('../models/User');
const { signToken } = require('../utils/jwt');

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

    const passwordMatches = await bcrypt.compare(password, user.password);
    if (!passwordMatches) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    user.lastLoginAt = new Date();
    await user.save();

    const token = signToken({
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
    });

    return res.status(200).json({
      token,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
      },
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  adminLogin,
};