const express = require('express');

const controller = require('../controllers/payout.controller');
const auth = require('../middleware/auth.middleware');
const admin = require('../middleware/admin.middleware');

const router = express.Router();

router.get('/', auth, controller.listPayouts);
router.post('/run', auth, admin, controller.runAutomaticPayouts);
router.post('/backfill', auth, admin, controller.backfillPayouts);

module.exports = router;