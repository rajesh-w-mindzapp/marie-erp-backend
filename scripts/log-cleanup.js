const fs = require('fs');
const path = require('path');
const logger = require('../src/config/logger');

// Log cleanup utility
class LogCleanup {
  constructor() {
    this.logsDir = path.join(__dirname, '../logs');
    this.retentionDays = {
      application: 14,    // Keep application logs for 14 days
      error: 30,          // Keep error logs for 30 days
      exceptions: 30,     // Keep exception logs for 30 days
      rejections: 30      // Keep rejection logs for 30 days
    };
  }

  // Get all log files in the logs directory
  getLogFiles() {
    try {
      if (!fs.existsSync(this.logsDir)) {
        logger.info('Logs directory does not exist, nothing to clean');
        return [];
      }

      const files = fs.readdirSync(this.logsDir);
      return files.filter(file => file.endsWith('.log') || file.endsWith('.gz'));
    } catch (error) {
      logger.error('Error reading logs directory', { error: error.message });
      return [];
    }
  }

  // Parse date from filename
  parseDateFromFilename(filename) {
    const match = filename.match(/(\d{4}-\d{2}-\d{2})/);
    if (match) {
      return new Date(match[1]);
    }
    return null;
  }

  // Check if file should be deleted based on retention policy
  shouldDeleteFile(filename, fileDate) {
    if (!fileDate) return false;

    const now = new Date();
    const daysOld = (now - fileDate) / (1000 * 60 * 60 * 24);

    // Determine retention period based on file type
    let retentionDays = 14; // default

    if (filename.includes('error')) {
      retentionDays = this.retentionDays.error;
    } else if (filename.includes('exceptions')) {
      retentionDays = this.retentionDays.exceptions;
    } else if (filename.includes('rejections')) {
      retentionDays = this.retentionDays.rejections;
    } else if (filename.includes('application')) {
      retentionDays = this.retentionDays.application;
    }

    return daysOld > retentionDays;
  }

  // Clean up old log files
  cleanup() {
    logger.info('Starting log cleanup process');
    
    const files = this.getLogFiles();
    let deletedCount = 0;
    let totalSize = 0;

    files.forEach(filename => {
      const filePath = path.join(this.logsDir, filename);
      const fileDate = this.parseDateFromFilename(filename);

      if (this.shouldDeleteFile(filename, fileDate)) {
        try {
          const stats = fs.statSync(filePath);
          fs.unlinkSync(filePath);
          
          deletedCount++;
          totalSize += stats.size;
          
          logger.info('Deleted old log file', {
            filename: filename,
            size: `${(stats.size / 1024 / 1024).toFixed(2)} MB`,
            age: `${Math.round((new Date() - fileDate) / (1000 * 60 * 60 * 24))} days`
          });
        } catch (error) {
          logger.error('Error deleting log file', {
            filename: filename,
            error: error.message
          });
        }
      }
    });

    logger.info('Log cleanup completed', {
      filesDeleted: deletedCount,
      totalSizeFreed: `${(totalSize / 1024 / 1024).toFixed(2)} MB`
    });

    return { deletedCount, totalSize };
  }

  // Get log statistics
  getStats() {
    const files = this.getLogFiles();
    const stats = {
      totalFiles: files.length,
      totalSize: 0,
      byType: {}
    };

    files.forEach(filename => {
      const filePath = path.join(this.logsDir, filename);
      try {
        const fileStats = fs.statSync(filePath);
        stats.totalSize += fileStats.size;

        // Categorize by file type
        let type = 'other';
        if (filename.includes('application')) type = 'application';
        else if (filename.includes('error')) type = 'error';
        else if (filename.includes('exceptions')) type = 'exceptions';
        else if (filename.includes('rejections')) type = 'rejections';

        if (!stats.byType[type]) {
          stats.byType[type] = { count: 0, size: 0 };
        }
        stats.byType[type].count++;
        stats.byType[type].size += fileStats.size;
      } catch (error) {
        logger.error('Error getting file stats', { filename, error: error.message });
      }
    });

    // Convert sizes to MB
    stats.totalSizeMB = (stats.totalSize / 1024 / 1024).toFixed(2);
    Object.keys(stats.byType).forEach(type => {
      stats.byType[type].sizeMB = (stats.byType[type].size / 1024 / 1024).toFixed(2);
    });

    return stats;
  }
}

// CLI interface
if (require.main === module) {
  const cleanup = new LogCleanup();
  const command = process.argv[2];

  switch (command) {
    case 'cleanup':
      cleanup.cleanup();
      break;
    case 'stats':
      const stats = cleanup.getStats();
      console.log('Log Statistics:');
      console.log(JSON.stringify(stats, null, 2));
      break;
    default:
      console.log('Usage: node log-cleanup.js [cleanup|stats]');
      console.log('  cleanup - Remove old log files based on retention policy');
      console.log('  stats   - Show log file statistics');
  }
}

module.exports = LogCleanup; 