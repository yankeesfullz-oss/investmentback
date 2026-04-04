const walletService = require('../services/wallet.service');

async function listWallets(req, res, next) {
  try {
    const wallets = await walletService.listUserWallets(req.user.id);
    return res.status(200).json(wallets);
  } catch (error) {
    return next(error);
  }
}

async function createWallet(req, res, next) {
  try {
    const wallet = await walletService.createWallet({ ...req.body, user: req.user.id });
    return res.status(201).json(wallet);
  } catch (error) {
    return next(error);
  }
}

async function adminFundWallet(req, res, next) {
  try {
    const result = await walletService.adminCreditWallet({
      userId: req.body.userId,
      email: req.body.email,
      currency: req.body.currency,
      amount: req.body.amount,
      note: req.body.note,
      createdByAdmin: req.user.id,
    });

    return res.status(201).json({
      success: true,
      user: {
        id: result.user.id,
        email: result.user.email,
        fullName: result.user.fullName,
      },
      wallet: {
        id: result.wallet.id,
        currency: result.wallet.currency,
        address: result.wallet.address,
        availableBalance: result.balanceAfter,
      },
      creditedAmount: req.body.amount,
      balanceBefore: result.balanceBefore,
      balanceAfter: result.balanceAfter,
      ledgerId: result.ledger.id,
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  listWallets,
  createWallet,
  adminFundWallet,
};
