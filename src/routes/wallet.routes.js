const express = require('express');

const controller = require('../controllers/wallet.controller');
const auth = require('../middleware/auth.middleware');
const admin = require('../middleware/admin.middleware');
const validate = require('../middleware/validate');

const router = express.Router();

router.get('/', auth, controller.listWallets);
router.post('/', auth, validate(['currency', 'address']), controller.createWallet);
router.post('/admin/fund', auth, admin, validate(['currency', 'amount']), controller.adminFundWallet);

module.exports = router;
