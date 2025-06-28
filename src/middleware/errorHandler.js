const logger = require('../config/logger');

// Error handling middleware
const errorHandler = (err, req, res, next) => {
  // Log the error
  logger.error('Unhandled error occurred', {
    error: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    body: req.body,
    params: req.params,
    query: req.query
  });

  // Set default error status and message
  const status = err.status || err.statusCode || 500;
  const message = err.message || 'Internal Server Error';

  // Don't leak error details in production
  const errorResponse = {
    error: {
      message: process.env.NODE_ENV === 'production' ? 'Internal Server Error' : message,
      status: status
    }
  };

  // Add stack trace in development
  if (process.env.NODE_ENV !== 'production') {
    errorResponse.error.stack = err.stack;
  }

  res.status(status).json(errorResponse);
};

// 404 handler
const notFoundHandler = (req, res, next) => {
  logger.warn('Route not found', {
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });

  res.status(404).json({
    error: {
      message: 'Route not found',
      status: 404,
      path: req.url
    }
  });
};

module.exports = {
  errorHandler,
  notFoundHandler
}; 