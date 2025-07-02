// src/config/db.js
const mysql = require('mysql2/promise'); // Use promise-based mysql2
const logger = require('./logger');
const dbLogger = require('../utils/dbLogger');
require('dotenv').config();

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  connectTimeout: 60000,
  acquireTimeout: 60000
});

// Log new connections
pool.on('connection', (conn) => {
  logger.info('🔌 New MySQL connection established', {
    threadId: conn.threadId,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME
  });
});

// Log pool errors
pool.on('error', (err) => {
  logger.error('❌ MySQL pool error', {
    error: err.message,
    code: err.code
  });
});

// Export the pool for direct promise-based queries
module.exports = pool;