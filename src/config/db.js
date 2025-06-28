const mysql = require('mysql2');
const logger = require('./logger');
const dbLogger = require('../utils/dbLogger');
require('dotenv').config();

const db = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  connectTimeout: 60000,
  acquireTimeout: 60000,
  timeout: 60000
});

// Database connection event handlers
db.on('connect', () => {
  logger.info('✅ Connected to MySQL database!', {
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    user: process.env.DB_USER
  });
});

db.on('error', (err) => {
  logger.error('Database connection error', {
    error: err.message,
    code: err.code,
    errno: err.errno
  });
});

db.on('end', () => {
  logger.warn('Database connection ended');
});

// Wrap the connect method to include logging
const originalConnect = db.connect;
db.connect = function(callback) {
  const start = Date.now();
  
  originalConnect.call(this, (err) => {
    const duration = Date.now() - start;
    
    if (err) {
      dbLogger.logError(err, 'CONNECT', {});
      logger.error('Failed to connect to database', {
        error: err.message,
        duration: `${duration}ms`
      });
    } else {
      dbLogger.logConnection('connected', { duration: `${duration}ms` });
    }
    
    if (callback) callback(err);
  });
};

// Wrap query method to include logging
const originalQuery = db.query;
db.query = function(sql, values, callback) {
  const start = Date.now();
  
  const wrappedCallback = (err, results) => {
    const duration = Date.now() - start;
    
    if (err) {
      dbLogger.logError(err, sql, values);
    } else {
      dbLogger.logQuery(sql, values, duration);
      dbLogger.logSlowQuery(sql, values, duration);
    }
    
    if (callback) callback(err, results);
  };
  
  return originalQuery.call(this, sql, values, wrappedCallback);
};

module.exports = db;
