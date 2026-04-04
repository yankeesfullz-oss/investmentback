const { verifyToken } = require('../utils/jwt');

module.exports = function setupSocketHandlers(io) {
  io.on('connection', (socket) => {
    socket.on('join_user_room', (userId) => {
      socket.join(String(userId));
    });

    socket.on('join_admin_room', (token) => {
      try {
        const payload = verifyToken(token);
        if (payload?.role !== 'admin') {
          socket.emit('socket_error', { message: 'Admin access required' });
          return;
        }

        socket.join('admins');
      } catch (error) {
        socket.emit('socket_error', { message: 'Invalid admin token' });
      }
    });

    socket.on('disconnect', () => {
      console.log(`Socket disconnected: ${socket.id}`);
    });
  });
};
