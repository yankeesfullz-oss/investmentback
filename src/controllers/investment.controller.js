const investmentService = require('../services/investment.service');

async function listInvestments(req, res, next) {
  try {
    const filter = req.user?.role === 'admin' ? {} : { user: req.user.id };
    const investments = await investmentService.listInvestments(filter);
    return res.status(200).json(investments);
  } catch (error) {
    return next(error);
  }
}

async function createInvestment(req, res, next) {
  try {
    const investment = await investmentService.createInvestment({
      ...req.body,
      user: req.user.id,
    });

    return res.status(201).json(investment);
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  listInvestments,
  createInvestment,
};