#!/bin/bash

# Database Backup Script for Marie ERP FoodSecure Backend
# This script creates automated backups of the MySQL database

# Configuration
BACKUP_DIR="./backups"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="marie_erp_backup_$DATE.sql"
RETENTION_DAYS=7

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

echo "Starting database backup..."

# Check if MySQL service is running
if ! docker-compose ps mysql | grep -q "Up"; then
    echo "⚠️  MySQL service is not running. Skipping backup."
    echo "   This is normal for fresh deployments or when services are stopped."
    exit 0
fi

# Check if MySQL is ready to accept connections
if ! docker-compose exec -T mysql mysqladmin ping -h localhost --silent 2>/dev/null; then
    echo "⚠️  MySQL is not ready to accept connections. Skipping backup."
    echo "   This is normal during service startup."
    exit 0
fi

# Create backup
docker-compose exec -T mysql mysqldump -u root -p"${MYSQL_ROOT_PASSWORD:-rootpassword}" marie_erp > "$BACKUP_DIR/$BACKUP_FILE"

# Check if backup was successful
if [ $? -eq 0 ]; then
    echo "✅ Backup completed successfully: $BACKUP_FILE"
    
    # Compress the backup file
    gzip "$BACKUP_DIR/$BACKUP_FILE"
    echo "✅ Backup compressed: $BACKUP_FILE.gz"
    
    # Remove old backups (older than RETENTION_DAYS)
    find "$BACKUP_DIR" -name "marie_erp_backup_*.sql.gz" -mtime +$RETENTION_DAYS -delete
    echo "✅ Cleaned up backups older than $RETENTION_DAYS days"
    
    # Show backup size
    BACKUP_SIZE=$(du -h "$BACKUP_DIR/$BACKUP_FILE.gz" | cut -f1)
    echo "📊 Backup size: $BACKUP_SIZE"
    
    # List recent backups
    echo "📋 Recent backups:"
    ls -lh "$BACKUP_DIR"/marie_erp_backup_*.sql.gz | tail -5 2>/dev/null || echo "   No backups found"
else
    echo "❌ Backup failed!"
    exit 1
fi 