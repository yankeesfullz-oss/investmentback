const { Server } = require('socket.io');

function initializeSocket(server, options = {}) {
  return new Server(server, {
    cors: options.cors || { origin: true, credentials: true },
  });
}

module.exports = {
  initializeSocket,
};
