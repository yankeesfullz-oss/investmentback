const express = require('express');

const controller = require('../controllers/investment.controller');
const auth = require('../middleware/auth.middleware');
const validate = require('../middleware/validate');

const router = express.Router();

router.get('/', auth, controller.listInvestments);
router.post('/', auth, validate(['property', 'startDate', 'durationMonths', 'slotPrice']), controller.createInvestment);

module.exports = router;