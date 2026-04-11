#!/usr/bin/env node

const mongoose = require('mongoose');

const connectDatabase = require('../src/config/database');
const { runAutomaticPayouts } = require('../src/services/payout.service');

function parseArgs(argv) {
  const options = {
    targetDate: new Date(),
    catchUp: true,
  };

  argv.forEach((entry) => {
    if (entry === '--no-catch-up') {
      options.catchUp = false;
      return;
    }

    if (entry.startsWith('--date=')) {
      options.targetDate = new Date(entry.slice('--date='.length));
    }
  });

  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  await connectDatabase();
  const summary = await runAutomaticPayouts(options);
  console.log(JSON.stringify(summary, null, 2));
  await mongoose.connection.close();
}

main().catch(async (error) => {
  console.error(error);
  try {
    await mongoose.connection.close();
  } catch (closeError) {
    console.error(closeError);
  }
  process.exit(1);
});