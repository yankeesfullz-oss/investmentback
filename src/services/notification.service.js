const { getSocketServer } = require('../config/socket');

function emitToUser(userId, event, payload) {
  try {
    const io = getSocketServer();
    io.to(String(userId)).emit(event, payload);
  } catch (error) {
    console.warn('Socket server not available for notification');
  }
}

function emitToAdmins(event, payload) {
  try {
    const io = getSocketServer();
    io.to('admins').emit(event, payload);
  } catch (error) {
    console.warn('Socket server not available for admin notification');
  }
}

module.exports = {
  emitToUser,
  emitToAdmins,
};
