const mongoose = require('mongoose');

const connectDatabase = require('../src/config/database');
const { syncAllWalletAddressesToAdminSettings } = require('../src/services/wallet.service');

async function main() {
  await connectDatabase();

  const result = await syncAllWalletAddressesToAdminSettings();

  console.log(
    JSON.stringify(
      {
        message: 'Wallet addresses synced to admin-managed deposit settings.',
        matchedWallets: result.matchedCount,
        updatedWallets: result.modifiedCount,
        config: result.config,
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.connection.close();
  });