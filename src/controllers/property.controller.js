const propertyService = require('../services/property.service');

async function listProperties(req, res, next) {
  try {
    const properties = await propertyService.listProperties();
    return res.status(200).json(properties);
  } catch (error) {
    return next(error);
  }
}

async function getProperty(req, res, next) {
  try {
    const property = await propertyService.getPropertyById(req.params.id);
    return res.status(200).json(property);
  } catch (error) {
    return next(error);
  }
}

async function createProperty(req, res, next) {
  try {
    const property = await propertyService.createProperty(req.body);
    return res.status(201).json(property);
  } catch (error) {
    return next(error);
  }
}

async function updateProperty(req, res, next) {
  try {
    const property = await propertyService.updateProperty(req.params.id, req.body);
    return res.status(200).json(property);
  } catch (error) {
    return next(error);
  }
}

async function autofillDraft(req, res, next) {
  try {
    const correlationId = `${Date.now().toString(36)}-${Math.random().toString(16).slice(2,8)}`;
    const result = await propertyService.autofillDraft(req.body, { correlationId });

    if (result && result.correlationId) {
      res.set('X-Autofill-Correlation-Id', result.correlationId);
    } else {
      res.set('X-Autofill-Correlation-Id', correlationId);
    }

    if (result && result.partial) {
      res.set('X-Autofill-Partial', '1');
    }

    return res.status(200).json((result && result.fields) || {});
  } catch (error) {
    return next(error);
  }
}

async function deleteProperty(req, res, next) {
  try {
    await propertyService.deleteProperty(req.params.id);
    return res.status(200).json({ success: true });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  listProperties,
  getProperty,
  createProperty,
  updateProperty,
  autofillDraft,
  deleteProperty,
};
