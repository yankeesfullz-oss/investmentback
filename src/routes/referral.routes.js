const express = require('express');

const controller = require('../controllers/referral.controller');
const admin = require('../middleware/admin.middleware');
const auth = require('../middleware/auth.middleware');

const router = express.Router();

router.get('/me', auth, controller.getMyReferralSummary);
router.get('/admin/commissions', auth, admin, controller.listAdminReferralCommissions);
router.patch('/:referralCommissionId/pay', auth, admin, controller.payReferralCommission);

module.exports = router;