const express = require('express');

const controller = require('../controllers/property.controller');
const auth = require('../middleware/auth.middleware');
const admin = require('../middleware/admin.middleware');
const validate = require('../middleware/validate');

const router = express.Router();

router.get('/', controller.listProperties);
router.post('/autofill', auth, admin, controller.autofillDraft);
router.get('/:id', auth, admin, controller.getProperty);
router.post('/', auth, admin, validate(['name', 'totalValue']), controller.createProperty);
router.patch('/:id', auth, admin, controller.updateProperty);
router.delete('/:id', auth, admin, controller.deleteProperty);

module.exports = router;
