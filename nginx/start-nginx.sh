#!/bin/bash

# Nginx startup script with SSL certificate handling

# Check if SSL certificates exist
if [ -f "/etc/nginx/ssl/live/gomarie.com/fullchain.pem" ] && [ -f "/etc/nginx/ssl/live/gomarie.com/privkey.pem" ]; then
    echo "SSL certificates found, starting Nginx with HTTPS support"
    # Use the full nginx.conf with SSL
    exec nginx -g "daemon off;"
else
    echo "SSL certificates not found, starting Nginx in HTTP-only mode"
    # Create a temporary nginx config without SSL
    cat > /etc/nginx/nginx-http.conf << 'EOF'
events {
    worker_connections 1024;
}

http {
    include       /etc/nginx/mime.types;
    default_type  application/octet-stream;

    # Logging
    log_format main '$remote_addr - $remote_user [$time_local] "$request" '
                    '$status $body_bytes_sent "$http_referer" '
                    '"$http_user_agent" "$http_x_forwarded_for"';

    access_log /var/log/nginx/access.log main;
    error_log /var/log/nginx/error.log warn;

    # Basic settings
    sendfile on;
    tcp_nopush on;
    tcp_nodelay on;
    keepalive_timeout 65;
    types_hash_max_size 2048;
    client_max_body_size 10M;

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_types
        text/plain
        text/css
        text/xml
        text/javascript
        application/json
        application/javascript
        application/xml+rss
        application/atom+xml
        image/svg+xml;

    # Rate limiting
    limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
    limit_req_zone $binary_remote_addr zone=login:10m rate=5r/m;

    # Upstream backend
    upstream backend {
        server backend:3000;
        keepalive 32;
    }

    # HTTP server (for Let's Encrypt challenges and API)
    server {
        listen 80;
        server_name _;

        # Let's Encrypt challenge location
        location /.well-known/acme-challenge/ {
            root /var/www/certbot;
            try_files $uri =404;
        }

        # API routes with rate limiting
        location /auth/ {
            limit_req zone=login burst=10 nodelay;
            proxy_pass http://backend;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_cache_bypass $http_upgrade;
            proxy_read_timeout 30s;
            proxy_connect_timeout 30s;
        }

        # General API routes
        location / {
            limit_req zone=api burst=20 nodelay;
            proxy_pass http://backend;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_cache_bypass $http_upgrade;
            proxy_read_timeout 30s;
            proxy_connect_timeout 30s;
        }

        # Health check endpoint
        location /health {
            access_log off;
            return 200 "healthy\n";
            add_header Content-Type text/plain;
        }
    }
}
EOF
    
    # Start nginx with HTTP-only config
    exec nginx -c /etc/nginx/nginx-http.conf -g "daemon off;"
fi 