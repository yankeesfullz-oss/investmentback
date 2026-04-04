const mongoose = require('mongoose');

const env = require('./env');

module.exports = async function connectDatabase() {
  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  await mongoose.connect(env.mongodbUri);
  return mongoose.connection;
};
