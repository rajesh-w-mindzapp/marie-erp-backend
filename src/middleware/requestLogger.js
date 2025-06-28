const logger = require('../config/logger');

// Custom request logging middleware
const requestLogger = (req, res, next) => {
  const start = Date.now();
  
  // Log the incoming request
  logger.info('Incoming request', {
    method: req.method,
    url: req.url,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    contentType: req.get('Content-Type'),
    contentLength: req.get('Content-Length'),
    query: Object.keys(req.query).length > 0 ? req.query : undefined,
    body: req.method !== 'GET' && req.method !== 'DELETE' ? req.body : undefined
  });

  // Override res.end to log response
  const originalEnd = res.end;
  res.end = function(chunk, encoding) {
    const duration = Date.now() - start;
    
    // Log the response
    logger.info('Request completed', {
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      contentLength: res.get('Content-Length'),
      ip: req.ip
    });

    // Call the original end method
    originalEnd.call(this, chunk, encoding);
  };

  next();
};

module.exports = requestLogger; 