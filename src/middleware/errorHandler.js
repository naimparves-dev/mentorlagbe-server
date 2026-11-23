export function errorHandler(err, req, res, _next) {
  const statusCode = err.statusCode || 500;
  console.error(`[ERROR] ${req.method} ${req.originalUrl}:`, err.message);
  return res.status(statusCode).json({
    success: false,
    message: err.message || "Internal Server Error",
  });
}
