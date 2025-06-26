#!/bin/bash

# Let's Encrypt SSL Setup Script for Marie ERP FoodSecure Backend
# This script handles SSL certificate setup and renewal

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
COMPOSE_FILE="docker-compose.prod.yml"

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
    print_status "Checking SSL setup prerequisites..."
    
    # Check if .env file exists
    if [ ! -f ".env" ]; then
        print_error ".env file not found. Please create it from env.example"
        exit 1
    fi
    
    # Check if DOMAIN_NAME is set
    if [ -z "$DOMAIN_NAME" ]; then
        print_error "DOMAIN_NAME not set in .env file"
        exit 1
    fi
    
    # Check if LETSENCRYPT_EMAIL is set
    if [ -z "$LETSENCRYPT_EMAIL" ]; then
        print_error "LETSENCRYPT_EMAIL not set in .env file"
        exit 1
    fi
    
    # Create required directories
    mkdir -p nginx/ssl nginx/www logs
    
    print_success "Prerequisites check passed"
}

# Function to setup initial SSL certificate
setup_ssl() {
    print_status "Setting up SSL certificate for domain: $DOMAIN_NAME"
    
    # Start services without SSL first
    print_status "Starting services for SSL setup..."
    docker-compose -f $COMPOSE_FILE up -d nginx backend mysql
    
    # Wait for services to be ready
    print_status "Waiting for services to be ready..."
    sleep 10
    
    # Run certbot to obtain certificate
    print_status "Obtaining SSL certificate from Let's Encrypt..."
    docker-compose -f $COMPOSE_FILE --profile ssl-setup run --rm certbot
    
    # Check if certificate was obtained successfully
    if [ -f "nginx/ssl/live/$DOMAIN_NAME/fullchain.pem" ]; then
        print_success "SSL certificate obtained successfully!"
        
        # Restart nginx to use the new certificate
        print_status "Restarting Nginx to use new certificate..."
        docker-compose -f $COMPOSE_FILE restart nginx
        
        print_success "SSL setup completed successfully!"
    else
        print_error "Failed to obtain SSL certificate"
        print_status "Check the logs: docker-compose -f $COMPOSE_FILE logs certbot"
        exit 1
    fi
}

# Function to renew SSL certificate
renew_ssl() {
    print_status "Renewing SSL certificate..."
    
    # Run certbot renewal
    docker-compose -f $COMPOSE_FILE --profile ssl-setup run --rm certbot renew
    
    # Restart nginx to use renewed certificate
    print_status "Restarting Nginx to use renewed certificate..."
    docker-compose -f $COMPOSE_FILE restart nginx
    
    print_success "SSL certificate renewal completed"
}

# Function to check certificate status
check_certificate() {
    print_status "Checking SSL certificate status..."
    
    if [ -f "nginx/ssl/live/$DOMAIN_NAME/fullchain.pem" ]; then
        print_success "SSL certificate found"
        
        # Check certificate expiration
        EXPIRY=$(openssl x509 -enddate -noout -in "nginx/ssl/live/$DOMAIN_NAME/fullchain.pem" | cut -d= -f2)
        print_status "Certificate expires on: $EXPIRY"
        
        # Check if certificate is valid
        if openssl x509 -checkend 86400 -noout -in "nginx/ssl/live/$DOMAIN_NAME/fullchain.pem" >/dev/null 2>&1; then
            print_success "Certificate is valid and not expiring soon"
        else
            print_warning "Certificate is expiring soon or has expired"
        fi
    else
        print_error "SSL certificate not found"
        exit 1
    fi
}

# Function to test SSL configuration
test_ssl() {
    print_status "Testing SSL configuration..."
    
    # Test HTTPS connection
    if curl -f -k https://$DOMAIN_NAME/ > /dev/null 2>&1; then
        print_success "HTTPS connection successful"
    else
        print_warning "HTTPS connection failed (this might be normal if DNS is not configured yet)"
    fi
    
    # Test certificate validity
    if echo | openssl s_client -servername $DOMAIN_NAME -connect $DOMAIN_NAME:443 2>/dev/null | openssl x509 -noout -dates; then
        print_success "SSL certificate validation successful"
    else
        print_warning "SSL certificate validation failed (this might be normal if DNS is not configured yet)"
    fi
}

# Function to setup automatic renewal
setup_auto_renewal() {
    print_status "Setting up automatic SSL renewal..."
    
    # Create renewal script
    cat > scripts/renew-ssl.sh << 'EOF'
#!/bin/bash
cd "$(dirname "$0")/.."
./scripts/ssl-setup.sh renew
EOF
    
    chmod +x scripts/renew-ssl.sh
    
    # Add to crontab (renew every 60 days)
    (crontab -l 2>/dev/null; echo "0 2 */60 * * cd $(pwd) && ./scripts/renew-ssl.sh >> logs/ssl-renewal.log 2>&1") | crontab -
    
    print_success "Automatic renewal configured (every 60 days at 2 AM)"
}

# Function to show SSL info
show_ssl_info() {
    echo ""
    print_success "SSL Setup Information"
    echo ""
    echo "Domain: $DOMAIN_NAME"
    echo "Email: $LETSENCRYPT_EMAIL"
    echo ""
    echo "Certificate location: nginx/ssl/live/$DOMAIN_NAME/"
    echo "Webroot location: nginx/www/"
    echo ""
    echo "Useful commands:"
    echo "  - Check certificate: ./scripts/ssl-setup.sh check"
    echo "  - Renew certificate: ./scripts/ssl-setup.sh renew"
    echo "  - Test SSL: ./scripts/ssl-setup.sh test"
    echo "  - Setup auto-renewal: ./scripts/ssl-setup.sh auto-renew"
    echo ""
}

# Load environment variables
if [ -f ".env" ]; then
    export $(grep -v '^#' .env | xargs)
fi

# Handle script arguments
case "${1:-setup}" in
    "setup")
        check_prerequisites
        setup_ssl
        check_certificate
        test_ssl
        show_ssl_info
        ;;
    "renew")
        check_prerequisites
        renew_ssl
        check_certificate
        ;;
    "check")
        check_prerequisites
        check_certificate
        ;;
    "test")
        check_prerequisites
        test_ssl
        ;;
    "auto-renew")
        setup_auto_renewal
        ;;
    "staging")
        print_status "Setting up SSL certificate in staging mode..."
        # Temporarily modify certbot command to use staging
        sed -i 's/--staging/--staging/g' docker-compose.prod.yml
        check_prerequisites
        setup_ssl
        check_certificate
        test_ssl
        show_ssl_info
        ;;
    "production")
        print_status "Setting up SSL certificate in production mode..."
        # Remove staging flag for production
        sed -i 's/--staging//g' docker-compose.prod.yml
        check_prerequisites
        setup_ssl
        check_certificate
        test_ssl
        show_ssl_info
        ;;
    *)
        echo "Usage: $0 {setup|renew|check|test|auto-renew|staging|production}"
        echo ""
        echo "Commands:"
        echo "  setup       - Initial SSL certificate setup (default)"
        echo "  renew       - Renew existing SSL certificate"
        echo "  check       - Check certificate status and expiration"
        echo "  test        - Test SSL configuration"
        echo "  auto-renew  - Setup automatic renewal via cron"
        echo "  staging     - Setup SSL certificate in staging mode (for testing)"
        echo "  production  - Setup SSL certificate in production mode"
        exit 1
        ;;
esac 