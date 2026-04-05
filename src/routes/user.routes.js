const express = require('express');

const controller = require('../controllers/user.controller');
const auth = require('../middleware/auth.middleware');
const admin = require('../middleware/admin.middleware');

const router = express.Router();

router.get('/me', auth, controller.getCurrentUser);
router.post('/sync', auth, controller.syncCurrentUser);
router.get('/', auth, admin, controller.listUsers);

module.exports = router;