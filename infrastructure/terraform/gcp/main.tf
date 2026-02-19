terraform {
  required_version = ">= 1.0"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }
}

# Configure the Google Cloud Provider
provider "google" {
  credentials = file(var.gcp_credentials_path)
  project     = var.project_id
  region      = var.region
  zone        = var.zone
}

# Enable required APIs
resource "google_project_service" "apis" {
  for_each = toset([
    "compute.googleapis.com",
    "dns.googleapis.com",
    "iam.googleapis.com",
    "cloudresourcemanager.googleapis.com"
  ])
  
  service                    = each.value
  disable_dependent_services = false
  disable_on_destroy        = false
}

# Service Account for the VM
resource "google_service_account" "hashpass_sso" {
  account_id   = "hashpass-sso"
  display_name = "HashPass SSO Service Account"
  description  = "Service account for HashPass Directus SSO instance"
}

# IAM role for the service account
resource "google_project_iam_member" "hashpass_sso_roles" {
  for_each = toset([
    "roles/logging.logWriter",
    "roles/monitoring.metricWriter",
    "roles/storage.objectViewer"
  ])
  
  project = var.project_id
  role    = each.value
  member  = "serviceAccount:${google_service_account.hashpass_sso.email}"
}

# Reserve a static IP for the VM
resource "google_compute_address" "sso_ip" {
  name         = "hashpass-sso-ip"
  region       = var.region
  description  = "Static IP for HashPass SSO"
}

# Firewall rule for HTTP/HTTPS traffic
resource "google_compute_firewall" "sso_firewall" {
  name    = "hashpass-sso-firewall"
  network = "default"
  
  allow {
    protocol = "tcp"
    ports    = ["80", "443", "22"]
  }
  
  source_ranges = ["0.0.0.0/0"]
  target_tags   = ["hashpass-sso"]
  
  description = "Allow HTTP, HTTPS, and SSH traffic for HashPass SSO"
}

# Startup script
locals {
  startup_script = <<-EOF
    #!/bin/bash
    
    # Log everything
    exec > >(tee -a /var/log/startup.log)
    exec 2>&1
    
    echo "Starting HashPass SSO setup at $(date)"
    
    # Update system
    apt-get update
    apt-get upgrade -y
    
    # Install Docker
    curl -fsSL https://get.docker.com | sh
    systemctl start docker
    systemctl enable docker
    
    # Install Docker Compose
    curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    chmod +x /usr/local/bin/docker-compose
    
    # Install Nginx and Certbot
    apt-get install -y nginx certbot python3-certbot-nginx
    systemctl start nginx
    systemctl enable nginx
    
    # Create hashpass directory
    mkdir -p /opt/hashpass
    cd /opt/hashpass
    
    # Create Nginx configuration
    cat > /etc/nginx/sites-available/sso.hashpass.co << 'NGINXEOF'
    server {
        listen 80;
        server_name sso.hashpass.co;
        
        location /.well-known/acme-challenge/ {
            root /var/www/html;
        }
        
        location / {
            proxy_pass http://127.0.0.1:8055;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_cache_bypass $http_upgrade;
        }
    }
NGINXEOF
    
    # Enable the site
    ln -sf /etc/nginx/sites-available/sso.hashpass.co /etc/nginx/sites-enabled/
    rm -f /etc/nginx/sites-enabled/default
    nginx -t && systemctl reload nginx
    
    # Configure swap for e2-micro
    fallocate -l 1G /swapfile
    chmod 600 /swapfile
    mkswap /swapfile
    swapon /swapfile
    echo '/swapfile none swap sw 0 0' >> /etc/fstab
    
    # Optimize for low memory
    echo 'vm.swappiness=10' >> /etc/sysctl.conf
    echo 'vm.vfs_cache_pressure=50' >> /etc/sysctl.conf
    sysctl -p
    
    # Create Docker Compose file
    cat > /opt/hashpass/docker-compose.yml << 'DOCKEREOF'
version: "3.8"

services:
  directus:
    image: directus/directus:10.10.5
    container_name: hashpass-directus-sso
    restart: unless-stopped
    
    ports:
      - "127.0.0.1:8055:8055"
    
    environment:
      KEY: "${var.directus_key}"
      SECRET: "${var.directus_secret}"
      NODE_ENV: production
      
      DB_CLIENT: pg
      DB_HOST: "${var.database_host}"
      DB_PORT: ${var.database_port}
      DB_DATABASE: "${var.database_name}"
      DB_USER: "${var.database_user}"
      DB_PASSWORD: "${var.database_password}"
      DB_SSL: "true"
      
      ADMIN_EMAIL: "${var.admin_email}"
      ADMIN_PASSWORD: "${var.admin_password}"
      
      PUBLIC_URL: "https://sso.hashpass.co"
      
      AUTH_PROVIDERS: "local"
      
      CORS_ENABLED: "true"
      CORS_ORIGIN: "https://hashpass.co,https://www.hashpass.co,https://sso.hashpass.co"
      CORS_CREDENTIALS: "true"
      
      WEBSOCKETS_ENABLED: "true"
    
    deploy:
      resources:
        limits:
          memory: 512M
        reservations:
          memory: 256M
    
    volumes:
      - directus_uploads:/directus/uploads
      - directus_extensions:/directus/extensions
    
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"

volumes:
  directus_uploads:
  directus_extensions:
DOCKEREOF
    
    echo "HashPass SSO setup completed at $(date)"
    echo "Next steps:"
    echo "1. Configure DNS: sso.hashpass.co -> $(curl -s http://metadata.google.internal/computeMetadata/v1/instance/network-interfaces/0/access-configs/0/external-ip -H 'Metadata-Flavor: Google')"
    echo "2. Get SSL certificate: certbot --nginx -d sso.hashpass.co"
    echo "3. Start Directus: cd /opt/hashpass && docker-compose up -d"
    
  EOF
}

# Create the VM instance
resource "google_compute_instance" "sso_instance" {
  name         = "hashpass-sso"
  machine_type = "e2-micro"
  zone         = var.zone
  
  tags = ["hashpass-sso"]
  
  boot_disk {
    initialize_params {
      image = "debian-cloud/debian-12"
      size  = 20
      type  = "pd-standard"
    }
  }
  
  network_interface {
    network = "default"
    
    access_config {
      nat_ip = google_compute_address.sso_ip.address
    }
  }
  
  service_account {
    email  = google_service_account.hashpass_sso.email
    scopes = ["cloud-platform"]
  }
  
  metadata_startup_script = local.startup_script
  
  allow_stopping_for_update = true
  
  labels = {
    environment = "prod"
    project     = "hashpass"
    component   = "sso"
  }
}

# DNS A record for sso.hashpass.co
resource "google_dns_record_set" "sso_a_record" {
  name         = "sso.hashpass.co."
  managed_zone = "hashpass-co"
  type         = "A"
  ttl          = 300

  rrdatas = [google_compute_address.sso_ip.address]
}