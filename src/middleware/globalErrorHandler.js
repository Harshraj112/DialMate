const globalErrHandler = (err, req, res, next) => {
  const statusCode = err?.statusCode || 500;

  // In production, hide stack trace
  const isProd = process.env.NODE_ENV === 'production';
  const stack = isProd ? undefined : err?.stack;

  const message = err?.message || 'Something went wrong. Please try again.';

  res.status(statusCode).json({
    success: false,
    message,
    stack, // Only visible in dev
  });
};

// 404 handler for unknown routes
const notFound = (req, res, next) => {
  const err = new Error(`Route '${req.originalUrl}' not found`);
  err.statusCode = 404;
  next(err);
};

module.exports = {
  globalErrHandler,
  notFound,
};