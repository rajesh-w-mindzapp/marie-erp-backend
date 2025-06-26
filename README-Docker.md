# Marie ERP FoodSecure Backend - Docker Deployment

This document provides instructions for deploying the Marie ERP FoodSecure Backend using Docker and Docker Compose.

## Prerequisites

- Docker (version 20.10 or higher)
- Docker Compose (version 2.0 or higher)
- Git

## Quick Start

### 1. Clone the Repository
```bash
git clone <repository-url>
cd MarieERP-FoodSecure-Backend-main
```

### 2. Configure Environment Variables
Copy the example environment file and configure your settings:
```bash
cp env.example .env
```

Edit `.env` file with your configuration:
```env
# Database Configuration
DB_HOST=mysql
DB_USER=marie_user
DB_PASS=your_secure_password
DB_NAME=marie_erp

# MySQL Root Password
MYSQL_ROOT_PASSWORD=your_secure_root_password

# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-change-in-production

# Email Configuration (for OTP and notifications)
USER_EMAIL=your-email@gmail.com
USER_PASS=your-app-password
EMAIL_USER=your-email@gmail.com

# Server Configuration
PORT=3000
NODE_ENV=production
```

### 3. Build and Start Services
```bash
# Build and start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Check service status
docker-compose ps
```

### 4. Verify Deployment
- Backend API: http://localhost:3000
- Database: localhost:3306 (MySQL)

## Service Architecture

### Services
1. **mysql** (Database)
   - MySQL 8.0
   - Persistent volume storage
   - Auto-initialization with schema
   - Health checks

2. **backend** (Node.js Application)
   - Express.js server
   - JWT authentication
   - Email services
   - Barcode generation
   - Health checks

### Network
- Custom bridge network: `marie-network`
- Internal communication between services
- Port 3000 exposed for external access

### Volumes
- `mysql_data`: Persistent MySQL data storage
- `./logs`: Application logs (optional)

## API Endpoints

### Authentication
- `POST /auth/register` - User registration
- `POST /auth/login` - User login
- `POST /auth/send-otp` - Send OTP
- `POST /auth/otpverify` - Verify OTP
- `POST /auth/update-password` - Update password

### Categories
- `GET /categories/getAll` - Get all categories
- `POST /categories/create` - Create category
- `DELETE /categories/:id` - Delete category

### Items
- `POST /items/create` - Create item
- `POST /items/details/create` - Create item details
- `GET /items/category/:categoryId` - Get items by category
- `DELETE /items/:itemId/:userId` - Delete item

### Stock Management
- `POST /stock/batch/create` - Create stock batch
- `POST /stock/out` - Stock out transaction
- `GET /stock/batches/:itemId` - Get stock batches

### Transactions
- `GET /transactions` - Get item transactions

### Barcode
- `POST /barcode/details` - Get product details by barcode

### Users
- `GET /users/profile` - Get user profile

## Management Commands

### Start Services
```bash
docker-compose up -d
```

### Stop Services
```bash
docker-compose down
```

### View Logs
```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f backend
docker-compose logs -f mysql
```

### Restart Services
```bash
# All services
docker-compose restart

# Specific service
docker-compose restart backend
```

### Update Application
```bash
# Pull latest changes
git pull

# Rebuild and restart
docker-compose down
docker-compose up -d --build
```

### Database Management
```bash
# Access MySQL shell
docker-compose exec mysql mysql -u root -p

# Backup database
docker-compose exec mysql mysqldump -u root -p marie_erp > backup.sql

# Restore database
docker-compose exec -T mysql mysql -u root -p marie_erp < backup.sql
```

### Clean Up
```bash
# Stop and remove containers, networks
docker-compose down

# Remove volumes (WARNING: This will delete all data)
docker-compose down -v

# Remove images
docker-compose down --rmi all
```

## Health Checks

Both services include health checks:
- **MySQL**: Uses `mysqladmin ping`
- **Backend**: HTTP GET request to root endpoint

Check health status:
```bash
docker-compose ps
```

## Security Considerations

1. **Change Default Passwords**: Update all default passwords in `.env`
2. **JWT Secret**: Use a strong, unique JWT secret
3. **Email Credentials**: Use app-specific passwords for email services
4. **Network Security**: Consider using reverse proxy (nginx) for production
5. **SSL/TLS**: Implement HTTPS for production deployments

## Production Deployment

### Environment Variables
Ensure all production environment variables are properly set:
- Strong database passwords
- Secure JWT secret
- Valid email credentials
- Production NODE_ENV

### Resource Limits
Add resource limits to `docker-compose.yml`:
```yaml
services:
  backend:
    deploy:
      resources:
        limits:
          memory: 512M
          cpus: '0.5'
    mysql:
      deploy:
        resources:
          limits:
            memory: 1G
            cpus: '1.0'
```

### Backup Strategy
Implement regular database backups:
```bash
# Create backup script
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
docker-compose exec mysql mysqldump -u root -p marie_erp > backup_$DATE.sql
```

### Monitoring
Consider adding monitoring services:
- Prometheus for metrics
- Grafana for visualization
- ELK stack for logs

## Troubleshooting

### Common Issues

1. **Port Already in Use**
   ```bash
   # Check what's using the port
   netstat -tulpn | grep :3000
   # Change port in docker-compose.yml
   ```

2. **Database Connection Issues**
   ```bash
   # Check MySQL logs
   docker-compose logs mysql
   # Verify environment variables
   docker-compose exec backend env | grep DB_
   ```

3. **Permission Issues**
   ```bash
   # Fix file permissions
   sudo chown -R $USER:$USER .
   ```

4. **Memory Issues**
   ```bash
   # Check container resource usage
   docker stats
   ```

### Log Analysis
```bash
# Search for errors
docker-compose logs | grep -i error

# Follow real-time logs
docker-compose logs -f --tail=100
```

## Support

For issues and questions:
1. Check the logs: `docker-compose logs`
2. Verify environment configuration
3. Ensure all prerequisites are met
4. Check Docker and Docker Compose versions

## License

This project is licensed under the ISC License. 