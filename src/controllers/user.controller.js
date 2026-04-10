const User = require('../models/User');

function getUserSelectFields() {
  return 'email fullName referralCode referrerUser role lastLoginAt createdAt updatedAt';
}

async function getCurrentUser(req, res, next) {
  try {
    const user = await User.findById(req.user.id).select(getUserSelectFields());

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    return res.status(200).json(user);
  } catch (error) {
    return next(error);
  }
}

async function syncCurrentUser(req, res, next) {
  try {
    const user = await User.findById(req.user.id).select(getUserSelectFields());

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    return res.status(200).json(user);
  } catch (error) {
    return next(error);
  }
}

async function listUsers(req, res, next) {
  try {
    const users = await User.find({ role: 'investor' })
      .select(getUserSelectFields())
      .sort({ createdAt: -1 });

    return res.status(200).json(users);
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  getCurrentUser,
  syncCurrentUser,
  listUsers,
};