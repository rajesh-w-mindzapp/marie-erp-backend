# Logging Setup Documentation

This document describes the comprehensive logging system implemented for the Marie ERP FoodSecure Backend application.

## Overview

The application uses **Winston** as the primary logging library with the following features:

- **Multiple log levels**: error, warn, info, debug
- **Daily log rotation**: Automatic file rotation with compression
- **Separate log files**: Different files for different log types
- **Console and file output**: Logs appear both in console and files
- **HTTP request logging**: Using Morgan middleware
- **Database operation logging**: Custom database query logging
- **Error tracking**: Comprehensive error and exception handling

## Log Files Structure

Logs are stored in the `logs/` directory with the following structure:

```
logs/
├── application-YYYY-MM-DD.log    # General application logs
├── error-YYYY-MM-DD.log          # Error logs only
├── exceptions-YYYY-MM-DD.log     # Uncaught exceptions
├── rejections-YYYY-MM-DD.log     # Unhandled promise rejections
└── application-YYYY-MM-DD.log.gz # Compressed old logs
```

## Configuration

### Environment Variables

Add these to your `.env` file:

```env
# Logging configuration
LOG_LEVEL=info                    # Log level: error, warn, info, debug
NODE_ENV=development              # Environment: development, production
```

### Log Levels

- **error**: Only error messages
- **warn**: Warning and error messages
- **info**: Info, warning, and error messages (default)
- **debug**: All messages including debug information

## Features

### 1. Request Logging

Every HTTP request is logged with:
- Request method and URL
- Client IP address
- User agent
- Request body (for non-GET requests)
- Response status code
- Response time
- Content length

### 2. Database Logging

Database operations are logged with:
- SQL queries
- Query parameters
- Execution time
- Slow query detection (default threshold: 1000ms)
- Connection events
- Error details

### 3. Error Handling

Comprehensive error logging includes:
- Error message and stack trace
- Request context (URL, method, IP, etc.)
- Database errors with SQL details
- Uncaught exceptions
- Unhandled promise rejections

### 4. Health Monitoring

A health check endpoint is available at `/health` that returns:
- Server status
- Uptime
- Environment information
- Timestamp

## Usage

### Starting the Application

```bash
# Development mode
npm run dev

# Production mode
npm run prod

# Default mode
npm start
```

### Log Management

```bash
# View log statistics
npm run logs:stats

# Clean up old log files
npm run logs:cleanup
```

## Log Retention Policy

- **Application logs**: 14 days
- **Error logs**: 30 days
- **Exception logs**: 30 days
- **Rejection logs**: 30 days

## Integration with Controllers

To use logging in your controllers, import the logger:

```javascript
const logger = require('../config/logger');

// Example usage in a controller
exports.createItem = async (req, res) => {
  try {
    logger.info('Creating new item', {
      userId: req.user.id,
      itemData: req.body
    });
    
    // Your logic here
    
    logger.info('Item created successfully', { itemId: result.id });
    res.status(201).json(result);
  } catch (error) {
    logger.error('Failed to create item', {
      error: error.message,
      userId: req.user.id,
      itemData: req.body
    });
    res.status(500).json({ error: 'Internal server error' });
  }
};
```

## Troubleshooting

### Common Issues

1. **Logs not appearing**: Check LOG_LEVEL environment variable
2. **Permission errors**: Ensure write permissions to logs directory
3. **Disk space**: Monitor log file sizes and run cleanup regularly

### Debug Mode

To enable debug logging:

```bash
LOG_LEVEL=debug npm run dev
```

This will show detailed database queries and additional debug information. 