const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const db = require('./config/db');
const logger = require('./config/logger');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const requestLogger = require('./middleware/requestLogger');
require('dotenv').config();
const authRouter = require('./routes/authRouter');
const categoryRoutes = require('./routes/categoryRoutes');
const itemRoutes = require('./routes/itemRoutes');
const stockRoutes = require('./routes/stockRoutes');
const transactionRoutes = require('./routes/transactionRoutes');
const userRoutes = require('./routes/userRoutes');
const barcodeRoutes = require('./routes/barcodeRoutes');
const app = express();

// Trust proxy for accurate IP addresses
app.set('trust proxy', 1);

// Middleware
app.use(cors());
app.use(express.json());

// Logging middleware
app.use(morgan('combined', { stream: logger.stream }));
app.use(requestLogger);

// Health check route
app.get('/health', (req, res) => {
  logger.info('Health check requested', { ip: req.ip });
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Default route
app.get('/', (req, res) => {
  logger.info('Root endpoint accessed', { ip: req.ip });
  res.send('Backend is running');
});

app.use('/auth', authRouter);
app.use('/categories', categoryRoutes);
app.use('/items', itemRoutes);
app.use('/stock', stockRoutes);
app.use('/transactions', transactionRoutes);
app.use('/users', userRoutes);
app.use('/barcode', barcodeRoutes);

// 404 handler (must be before error handler)
app.use(notFoundHandler);

// Error handling middleware (must be last)
app.use(errorHandler);

const PORT = process.env.PORT || 3000;

// Graceful shutdown handling
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  process.exit(0);
});

// Unhandled promise rejection handler
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', {
    promise: promise,
    reason: reason
  });
});

// Uncaught exception handler
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', {
    error: error.message,
    stack: error.stack
  });
  process.exit(1);
});

app.listen(PORT, () => {
  logger.info(`🚀 Server started successfully`, {
    port: PORT,
    environment: process.env.NODE_ENV || 'development',
    nodeVersion: process.version,
    platform: process.platform
  });
});
