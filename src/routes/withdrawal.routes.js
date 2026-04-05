const express = require('express');

const controller = require('../controllers/withdrawal.controller');
const auth = require('../middleware/auth.middleware');
const admin = require('../middleware/admin.middleware');
const validate = require('../middleware/validate');

const router = express.Router();

router.get('/', auth, controller.listWithdrawals);
router.post('/', auth, validate(['amount', 'currency', 'network', 'destinationAddress']), controller.createWithdrawal);
router.patch('/:id/:action', auth, admin, controller.updateWithdrawalStatus);

module.exports = router;