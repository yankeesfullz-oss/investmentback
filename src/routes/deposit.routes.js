const express = require('express');

const controller = require('../controllers/deposit.controller');
const auth = require('../middleware/auth.middleware');

const router = express.Router();

router.get('/', auth, controller.listDeposits);

module.exports = router;