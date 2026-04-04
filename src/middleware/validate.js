module.exports = function validate(requiredFields = []) {
  return function validateMiddleware(req, res, next) {
    const missing = requiredFields.filter((field) => req.body?.[field] == null || req.body?.[field] === '');

    if (missing.length > 0) {
      return res.status(400).json({ message: `Missing required fields: ${missing.join(', ')}` });
    }

    return next();
  };
};
