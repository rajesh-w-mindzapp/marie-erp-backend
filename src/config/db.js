// src/config/db.js
const mysql = require('mysql2');
const logger = require('./logger');
const dbLogger = require('../utils/dbLogger');
require('dotenv').config();

// Create a pool instead of a single connection.
// The pool will manage multiple connections, reconnect dropped ones, and
// hand you a fresh connection on every query.
const pool = mysql
  .createPool({
    host:            process.env.DB_HOST,
    user:            process.env.DB_USER,
    password:        process.env.DB_PASS,
    database:        process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit:      0,
    connectTimeout:  60000,
    acquireTimeout:  60000
  });

// Log when each new physical connection is established
pool.on('connection', (conn) => {
  logger.info('🔌 New MySQL connection established', {
    threadId: conn.threadId,
    host:     process.env.DB_HOST,
    database: process.env.DB_NAME
  });
});

// Log connection errors at the pool level
pool.on('error', (err) => {
  logger.error('❌ MySQL pool error', {
    error: err.message,
    code:  err.code
  });
});

// Wrap pool.query to add timing + error logging via dbLogger
const originalQuery = pool.query.bind(pool);
pool.query = (sql, values, callback) => {
  const start = Date.now();

  // Support both callback and promise usage
  const cb = typeof callback === 'function'
    ? callback
    : undefined;

  const wrappedCallback = (err, results, fields) => {
    const duration = Date.now() - start;

    if (err) {
      dbLogger.logError(err, sql, values);
    } else {
      dbLogger.logQuery(sql, values, duration);
      dbLogger.logSlowQuery(sql, values, duration);
    }

    if (cb) {
      cb(err, results, fields);
    }
  };

  // If user passed a callback, use it; otherwise return a Promise
  if (cb) {
    return originalQuery(sql, values, wrappedCallback);
  } else {
    return originalQuery(sql, values).then(results => {
      wrappedCallback(null, results);
      return results;
    }).catch(err => {
      wrappedCallback(err);
      throw err;
    });
  }
};

module.exports = pool;
