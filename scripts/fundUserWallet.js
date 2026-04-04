#!/usr/bin/env node

require('dotenv').config();

const mongoose = require('mongoose');
const walletService = require('../src/services/wallet.service');

function printUsage() {
  console.log('Usage: node scripts/fundUserWallet.js <email> <currency> <amount> [note]');
  console.log('Example: node scripts/fundUserWallet.js investor@example.com USDT 5000 "Manual test funding"');
}

async function main() {
  const [, , emailArg, currencyArg, amountArg, ...noteParts] = process.argv;

  if (!emailArg || emailArg === '--help' || emailArg === '-h') {
    printUsage();
    process.exit(emailArg ? 0 : 1);
  }

  if (!currencyArg || !amountArg) {
    printUsage();
    process.exit(1);
  }

  const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/investair';
  const note = noteParts.join(' ').trim();

  try {
    await mongoose.connect(mongoUri, { useNewUrlParser: true, useUnifiedTopology: true });

    const result = await walletService.adminCreditWallet({
      email: emailArg,
      currency: currencyArg,
      amount: amountArg,
      note: note || 'Manual CLI funding',
      createdByAdmin: null,
    });

    console.log(`Credited ${amountArg} ${String(currencyArg).toUpperCase()} to ${result.user.email}`);
    console.log(`Wallet: ${result.wallet.address}`);
    console.log(`Balance before: ${result.balanceBefore}`);
    console.log(`Balance after: ${result.balanceAfter}`);
    console.log(`Ledger entry: ${result.ledger.id}`);

    await mongoose.disconnect();
  } catch (error) {
    console.error(`Funding failed: ${error.message}`);
    try {
      await mongoose.disconnect();
    } catch (disconnectError) {
      // ignore disconnect errors on failure
    }
    process.exit(1);
  }
}

main();