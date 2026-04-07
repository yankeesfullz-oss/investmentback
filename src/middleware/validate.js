const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const STRONG_PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{8,}$/;

function validate(requiredFields = []) {
  return function validateMiddleware(req, res, next) {
    const missing = requiredFields.filter((field) => req.body?.[field] == null || req.body?.[field] === '');

    if (missing.length > 0) {
      return res.status(400).json({ message: `Missing required fields: ${missing.join(', ')}` });
    }

    return next();
  };
}

function normalizeBodyString(value) {
  return String(value || '').trim();
}

function validateEmail(email) {
  return EMAIL_REGEX.test(email);
}

function validateStrongPassword(password) {
  return STRONG_PASSWORD_REGEX.test(password);
}

function validateInvestorSignup(req, res, next) {
  const fullName = normalizeBodyString(req.body?.fullName);
  const email = normalizeBodyString(req.body?.email).toLowerCase();
  const password = String(req.body?.password || '');
  const confirmPassword = String(req.body?.confirmPassword || '');

  if (!fullName || !email || !password || !confirmPassword) {
    return res.status(400).json({ message: 'Full name, email, password, and confirm password are required' });
  }

  if (!validateEmail(email)) {
    return res.status(400).json({ message: 'Enter a valid email address' });
  }

  if (!validateStrongPassword(password)) {
    return res.status(400).json({
      message: 'Password must be at least 8 characters and include uppercase, lowercase, number, and special character',
    });
  }

  if (password !== confirmPassword) {
    return res.status(400).json({ message: 'Password and confirm password must match' });
  }

  req.body.fullName = fullName;
  req.body.email = email;
  req.body.password = password;
  delete req.body.confirmPassword;

  return next();
}

function validateInvestorLogin(req, res, next) {
  const email = normalizeBodyString(req.body?.email).toLowerCase();
  const password = String(req.body?.password || '');

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required' });
  }

  if (!validateEmail(email)) {
    return res.status(400).json({ message: 'Enter a valid email address' });
  }

  req.body.email = email;
  req.body.password = password;

  return next();
}

validate.validateInvestorSignup = validateInvestorSignup;
validate.validateInvestorLogin = validateInvestorLogin;
validate.validateEmail = validateEmail;
validate.validateStrongPassword = validateStrongPassword;

module.exports = validate;
