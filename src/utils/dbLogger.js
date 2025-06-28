const logger = require('../config/logger');

// Database logging utility
const dbLogger = {
  // Log successful database operations
  logQuery: (query, params, duration) => {
    logger.debug('Database query executed', {
      query: query,
      params: params,
      duration: `${duration}ms`
    });
  },

  // Log database errors
  logError: (error, query, params) => {
    logger.error('Database error occurred', {
      error: error.message,
      code: error.code,
      errno: error.errno,
      sqlState: error.sqlState,
      sqlMessage: error.sqlMessage,
      query: query,
      params: params,
      stack: error.stack
    });
  },

  // Log database connection events
  logConnection: (event, details = {}) => {
    logger.info(`Database ${event}`, details);
  },

  // Log slow queries
  logSlowQuery: (query, params, duration, threshold = 1000) => {
    if (duration > threshold) {
      logger.warn('Slow database query detected', {
        query: query,
        params: params,
        duration: `${duration}ms`,
        threshold: `${threshold}ms`
      });
    }
  }
};

module.exports = dbLogger; 