const express = require('express');

const controller = require('../controllers/auth.controller');
const validate = require('../middleware/validate');

const router = express.Router();

router.post('/signup', validate.validateInvestorSignup, controller.investorSignup);
router.post('/login', validate.validateInvestorLogin, controller.investorLogin);
router.post('/admin/login', controller.adminLogin);

module.exports = router;