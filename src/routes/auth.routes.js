const express = require('express');

const controller = require('../controllers/auth.controller');

const router = express.Router();

router.post('/admin/login', controller.adminLogin);

module.exports = router;