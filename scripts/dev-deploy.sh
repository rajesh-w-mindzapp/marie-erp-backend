#!/bin/bash

# Development Deployment Script for Marie ERP FoodSecure Backend
# This script handles development deployment using docker-compose.yml

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
COMPOSE_FILE="docker-compose.yml"

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
        print_warning ".env file not found. Creating from template..."
        cp env.example .env
        print_warning "Please edit .env file with your configuration before continuing."
        print_warning "Press Enter to continue or Ctrl+C to abort..."
        read
    fi
    
    # Check if required directories exist
    mkdir -p logs backups uploads
    
    print_success "Prerequisites check passed"
}

# Function to stop existing services
stop_services() {
    print_status "Stopping existing services..."
    docker-compose down --remove-orphans
    print_success "Services stopped"
}

# Function to build and start services
deploy_services() {
    print_status "Building and starting services..."
    
    # Build images
    docker-compose build --no-cache
    
    # Start services
    docker-compose up -d
    
    print_success "Services deployed successfully"
}

# Function to wait for services to be healthy
wait_for_health() {
    print_status "Waiting for services to be healthy..."
    
    # Wait for MySQL
    print_status "Waiting for MySQL..."
    timeout=60
    while [ $timeout -gt 0 ]; do
        if docker-compose exec -T mysql mysqladmin ping -h localhost --silent 2>/dev/null; then
            print_success "MySQL is healthy"
            break
        fi
        sleep 2
        timeout=$((timeout - 2))
    done
    
    if [ $timeout -le 0 ]; then
        print_error "MySQL failed to become healthy"
        print_status "Checking MySQL logs..."
        docker-compose logs mysql
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
        print_status "Checking Backend logs..."
        docker-compose logs backend
        exit 1
    fi
}

# Function to verify deployment
verify_deployment() {
    print_status "Verifying deployment..."
    
    # Check if services are running
    if docker-compose ps | grep -q "Up"; then
        print_success "All services are running"
    else
        print_error "Some services are not running"
        docker-compose ps
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
    print_success "Development deployment completed successfully!"
    echo ""
    echo "Service URLs:"
    echo "  - Backend API: http://localhost:3000"
    echo "  - Database: localhost:3306"
    echo ""
    echo "Useful commands:"
    echo "  - View logs: docker-compose logs -f"
    echo "  - Stop services: docker-compose down"
    echo "  - Restart services: docker-compose restart"
    echo "  - Create backup: ./scripts/backup.sh"
    echo "  - Access MySQL: docker-compose exec mysql mysql -u root -p"
    echo ""
}

# Main deployment function
main() {
    echo "🚀 Starting Marie ERP FoodSecure Backend development deployment..."
    echo ""
    
    check_prerequisites
    stop_services
    deploy_services
    wait_for_health
    verify_deployment
    show_deployment_info
}

# Handle script arguments
case "${1:-deploy}" in
    "deploy")
        main
        ;;
    "status")
        print_status "Checking deployment status..."
        docker-compose ps
        ;;
    "logs")
        print_status "Showing logs..."
        docker-compose logs -f
        ;;
    "stop")
        print_status "Stopping services..."
        docker-compose down
        print_success "Services stopped"
        ;;
    "restart")
        print_status "Restarting services..."
        docker-compose restart
        print_success "Services restarted"
        ;;
    "clean")
        print_status "Cleaning up..."
        docker-compose down -v --remove-orphans
        docker system prune -f
        print_success "Cleanup completed"
        ;;
    *)
        echo "Usage: $0 {deploy|status|logs|stop|restart|clean}"
        echo ""
        echo "Commands:"
        echo "  deploy   - Deploy the application (default)"
        echo "  status   - Show deployment status"
        echo "  logs     - Show application logs"
        echo "  stop     - Stop all services"
        echo "  restart  - Restart all services"
        echo "  clean    - Stop and remove all containers, networks, and volumes"
        exit 1
        ;;
esac 