const express = require('express');

const controller = require('../controllers/payout.controller');
const auth = require('../middleware/auth.middleware');

const router = express.Router();

router.get('/', auth, controller.listPayouts);

module.exports = router;