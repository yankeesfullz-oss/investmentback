module.exports = function errorHandler(error, req, res, next) {
  const statusCode = Number(error?.statusCode || error?.status || 500);
  const message = error?.message || 'Internal server error';

  if (statusCode >= 500) {
    console.error('[error]', error);
  }

  return res.status(statusCode).json({ message });
};
