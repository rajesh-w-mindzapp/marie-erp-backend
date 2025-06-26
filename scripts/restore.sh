#!/bin/bash

# Database Restore Script for Marie ERP FoodSecure Backend
# This script restores the MySQL database from a backup file

# Configuration
BACKUP_DIR="./backups"

# Function to display usage
usage() {
    echo "Usage: $0 <backup_file>"
    echo "Example: $0 marie_erp_backup_20241201_143022.sql.gz"
    echo ""
    echo "Available backups:"
    ls -lh "$BACKUP_DIR"/marie_erp_backup_*.sql.gz 2>/dev/null || echo "No backups found in $BACKUP_DIR"
    exit 1
}

# Check if backup file is provided
if [ $# -eq 0 ]; then
    usage
fi

BACKUP_FILE="$1"

# Check if backup file exists
if [ ! -f "$BACKUP_FILE" ] && [ ! -f "$BACKUP_DIR/$BACKUP_FILE" ]; then
    echo "❌ Backup file not found: $BACKUP_FILE"
    echo ""
    usage
fi

# Determine full path to backup file
if [ -f "$BACKUP_FILE" ]; then
    FULL_BACKUP_PATH="$BACKUP_FILE"
else
    FULL_BACKUP_PATH="$BACKUP_DIR/$BACKUP_FILE"
fi

echo "⚠️  WARNING: This will overwrite the current database!"
echo "Backup file: $FULL_BACKUP_PATH"
echo ""

# Ask for confirmation
read -p "Are you sure you want to proceed? (yes/no): " confirm

if [ "$confirm" != "yes" ]; then
    echo "❌ Restore cancelled."
    exit 0
fi

echo "Starting database restore..."

# Check if backup is compressed
if [[ "$FULL_BACKUP_PATH" == *.gz ]]; then
    echo "📦 Decompressing backup file..."
    gunzip -c "$FULL_BACKUP_PATH" | docker-compose exec -T mysql mysql -u root -p"${MYSQL_ROOT_PASSWORD:-rootpassword}" marie_erp
else
    docker-compose exec -T mysql mysql -u root -p"${MYSQL_ROOT_PASSWORD:-rootpassword}" marie_erp < "$FULL_BACKUP_PATH"
fi

# Check if restore was successful
if [ $? -eq 0 ]; then
    echo "✅ Database restore completed successfully!"
    echo ""
    echo "Next steps:"
    echo "1. Restart the backend service: docker-compose restart backend"
    echo "2. Verify the application is working: curl http://localhost:3000"
else
    echo "❌ Database restore failed!"
    exit 1
fi 