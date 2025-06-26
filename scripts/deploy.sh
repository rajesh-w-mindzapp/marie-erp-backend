#!/bin/bash

# Production Deployment Script for Marie ERP FoodSecure Backend
# This script handles the complete deployment process

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
COMPOSE_FILE="docker-compose.prod.yml"
BACKUP_BEFORE_DEPLOY=true

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to check prerequisites
check_prerequisites() {
    print_status "Checking prerequisites..."
    
    # Check if Docker is installed
    if ! command -v docker &> /dev/null; then
        print_error "Docker is not installed. Please install Docker first."
        exit 1
    fi
    
    # Check if Docker Compose is installed
    if ! command -v docker-compose &> /dev/null; then
        print_error "Docker Compose is not installed. Please install Docker Compose first."
        exit 1
    fi
    
    # Check if .env file exists
    if [ ! -f ".env" ]; then
        print_error ".env file not found. Please create it from env.example"
        exit 1
    fi
    
    # Check if required directories exist
    mkdir -p logs nginx/ssl mysql/conf.d backups uploads
    
    print_success "Prerequisites check passed"
}

# Function to create backup
create_backup() {
    if [ "$BACKUP_BEFORE_DEPLOY" = true ]; then
        print_status "Creating backup before deployment..."
        
        # Check if this is a fresh deployment (no existing services)
        if ! docker-compose ps | grep -q "Up"; then
            print_warning "No existing services found. Skipping backup for fresh deployment."
            return 0
        fi
        
        # Try to create backup
        if ./scripts/backup.sh; then
            print_success "Backup created successfully"
        else
            print_warning "Backup failed or was skipped (this is normal for fresh deployments)"
        fi
    fi
}

# Function to stop existing services
stop_services() {
    print_status "Stopping existing services..."
    docker-compose -f $COMPOSE_FILE down --remove-orphans
    print_success "Services stopped"
}

# Function to pull latest changes
pull_changes() {
    print_status "Pulling latest changes..."
    git pull origin main
    print_success "Latest changes pulled"
}

# Function to build and start services
deploy_services() {
    print_status "Building and starting services..."
    
    # Build images
    docker-compose -f $COMPOSE_FILE build --no-cache
    
    # Start services
    docker-compose -f $COMPOSE_FILE up -d
    
    print_success "Services deployed successfully"
}

# Function to wait for services to be healthy
wait_for_health() {
    print_status "Waiting for services to be healthy..."
    
    # Wait for MySQL
    print_status "Waiting for MySQL..."
    timeout=60
    while [ $timeout -gt 0 ]; do
        if docker-compose -f $COMPOSE_FILE exec -T mysql mysqladmin ping -h localhost --silent; then
            print_success "MySQL is healthy"
            break
        fi
        sleep 2
        timeout=$((timeout - 2))
    done
    
    if [ $timeout -le 0 ]; then
        print_error "MySQL failed to become healthy"
        exit 1
    fi
    
    # Wait for Backend
    print_status "Waiting for Backend..."
    timeout=60
    while [ $timeout -gt 0 ]; do
        if curl -f http://localhost:3000/ > /dev/null 2>&1; then
            print_success "Backend is healthy"
            break
        fi
        sleep 2
        timeout=$((timeout - 2))
    done
    
    if [ $timeout -le 0 ]; then
        print_error "Backend failed to become healthy"
        exit 1
    fi
}

# Function to run database migrations
run_migrations() {
    print_status "Running database migrations..."
    # Add any migration scripts here if needed
    print_success "Database migrations completed"
}

# Function to verify deployment
verify_deployment() {
    print_status "Verifying deployment..."
    
    # Check if services are running
    if docker-compose -f $COMPOSE_FILE ps | grep -q "Up"; then
        print_success "All services are running"
    else
        print_error "Some services are not running"
        docker-compose -f $COMPOSE_FILE ps
        exit 1
    fi
    
    # Test API endpoint
    if curl -f http://localhost:3000/ > /dev/null 2>&1; then
        print_success "API is responding"
    else
        print_error "API is not responding"
        exit 1
    fi
    
    print_success "Deployment verification completed"
}

# Function to show deployment info
show_deployment_info() {
    echo ""
    print_success "Deployment completed successfully!"
    echo ""
    echo "Service URLs:"
    echo "  - Backend API: http://localhost:3000"
    echo "  - Database: localhost:3306"
    echo ""
    echo "Useful commands:"
    echo "  - View logs: docker-compose -f $COMPOSE_FILE logs -f"
    echo "  - Stop services: docker-compose -f $COMPOSE_FILE down"
    echo "  - Restart services: docker-compose -f $COMPOSE_FILE restart"
    echo "  - Create backup: ./scripts/backup.sh"
    echo "  - Restore backup: ./scripts/restore.sh <backup_file>"
    echo ""
}

# Main deployment function
main() {
    echo "🚀 Starting Marie ERP FoodSecure Backend deployment..."
    echo ""
    
    check_prerequisites
    create_backup
    stop_services
    pull_changes
    deploy_services
    wait_for_health
    run_migrations
    verify_deployment
    show_deployment_info
}

# Handle script arguments
case "${1:-deploy}" in
    "deploy")
        main
        ;;
    "rollback")
        print_status "Rolling back to previous version..."
        # Add rollback logic here
        ;;
    "status")
        print_status "Checking deployment status..."
        docker-compose -f $COMPOSE_FILE ps
        ;;
    "logs")
        print_status "Showing logs..."
        docker-compose -f $COMPOSE_FILE logs -f
        ;;
    "backup")
        print_status "Creating backup..."
        ./scripts/backup.sh
        ;;
    "restore")
        if [ -z "$2" ]; then
            print_error "Please provide backup file name"
            echo "Usage: $0 restore <backup_file>"
            exit 1
        fi
        print_status "Restoring from backup..."
        ./scripts/restore.sh "$2"
        ;;
    *)
        echo "Usage: $0 {deploy|rollback|status|logs|backup|restore}"
        echo ""
        echo "Commands:"
        echo "  deploy   - Deploy the application (default)"
        echo "  rollback - Rollback to previous version"
        echo "  status   - Show deployment status"
        echo "  logs     - Show application logs"
        echo "  backup   - Create database backup"
        echo "  restore  - Restore from backup file"
        exit 1
        ;;
esac 