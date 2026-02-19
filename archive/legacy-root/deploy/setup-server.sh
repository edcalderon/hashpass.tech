#!/bin/bash
# ===========================================
# HashPass GCP e2-micro Setup Script
# ===========================================
# This script sets up a fresh GCP e2-micro instance
# with Docker, Nginx, and Certbot for HashPass API.
#
# Usage:
#   chmod +x setup-server.sh
#   sudo ./setup-server.sh
#
# Prerequisites:
#   - Fresh Debian/Ubuntu VM on GCP
#   - Domain pointing to this VM's IP
# ===========================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}===========================================\n"
echo "HashPass Server Setup"
echo -e "===========================================${NC}\n"

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}Please run as root (sudo ./setup-server.sh)${NC}"
    exit 1
fi

# ===========================================
# 1. System Updates
# ===========================================
echo -e "${YELLOW}[1/7] Updating system packages...${NC}"
apt-get update
apt-get upgrade -y

# ===========================================
# 2. Install Docker
# ===========================================
echo -e "${YELLOW}[2/7] Installing Docker...${NC}"

# Remove old versions
apt-get remove -y docker docker-engine docker.io containerd runc 2>/dev/null || true

# Install dependencies
apt-get install -y \
    apt-transport-https \
    ca-certificates \
    curl \
    gnupg \
    lsb-release

# Add Docker's official GPG key
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg

# Add Docker repository
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian \
  $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null

# Install Docker
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Start and enable Docker
systemctl start docker
systemctl enable docker

echo -e "${GREEN}✓ Docker installed${NC}"

# ===========================================
# 3. Install Nginx
# ===========================================
echo -e "${YELLOW}[3/7] Installing Nginx...${NC}"

apt-get install -y nginx

# Start and enable Nginx
systemctl start nginx
systemctl enable nginx

echo -e "${GREEN}✓ Nginx installed${NC}"

# ===========================================
# 4. Install Certbot
# ===========================================
echo -e "${YELLOW}[4/7] Installing Certbot...${NC}"

apt-get install -y certbot python3-certbot-nginx

echo -e "${GREEN}✓ Certbot installed${NC}"

# ===========================================
# 5. Install Flyway
# ===========================================
echo -e "${YELLOW}[5/7] Installing Flyway...${NC}"

FLYWAY_VERSION="10.4.1"
cd /tmp
wget -qO- https://repo1.maven.org/maven2/org/flywaydb/flyway-commandline/${FLYWAY_VERSION}/flyway-commandline-${FLYWAY_VERSION}-linux-x64.tar.gz | tar xvz
mv flyway-${FLYWAY_VERSION} /opt/flyway
ln -sf /opt/flyway/flyway /usr/local/bin/flyway

echo -e "${GREEN}✓ Flyway installed${NC}"

# ===========================================
# 6. Create HashPass directory structure
# ===========================================
echo -e "${YELLOW}[6/7] Creating directory structure...${NC}"

mkdir -p /opt/hashpass
mkdir -p /var/log/hashpass
mkdir -p /var/www/certbot

echo -e "${GREEN}✓ Directories created${NC}"

# ===========================================
# 7. Configure swap (important for e2-micro)
# ===========================================
echo -e "${YELLOW}[7/7] Configuring swap...${NC}"

# Check if swap already exists
if [ ! -f /swapfile ]; then
    # Create 1GB swap file
    fallocate -l 1G /swapfile
    chmod 600 /swapfile
    mkswap /swapfile
    swapon /swapfile
    
    # Make swap permanent
    echo '/swapfile none swap sw 0 0' >> /etc/fstab
    
    # Optimize swap settings for low-memory VMs
    echo 'vm.swappiness=10' >> /etc/sysctl.conf
    echo 'vm.vfs_cache_pressure=50' >> /etc/sysctl.conf
    sysctl -p
    
    echo -e "${GREEN}✓ Swap configured (1GB)${NC}"
else
    echo -e "${YELLOW}Swap already exists${NC}"
fi

# ===========================================
# Summary
# ===========================================
echo -e "\n${GREEN}===========================================\n"
echo "Setup Complete!"
echo -e "===========================================${NC}\n"

echo "Installed components:"
echo "  ✓ Docker $(docker --version | awk '{print $3}')"
echo "  ✓ Docker Compose (plugin)"
echo "  ✓ Nginx $(nginx -v 2>&1 | awk -F/ '{print $2}')"
echo "  ✓ Certbot $(certbot --version | awk '{print $2}')"
echo "  ✓ Flyway ${FLYWAY_VERSION}"
echo "  ✓ 1GB Swap"

echo -e "\n${YELLOW}Next steps:${NC}"
echo "1. Copy your docker-compose.yml and .env to /opt/hashpass/"
echo "2. Copy nginx config: sudo cp nginx-site.conf /etc/nginx/sites-available/api.hashpass.tech"
echo "3. Enable nginx site: sudo ln -s /etc/nginx/sites-available/api.hashpass.tech /etc/nginx/sites-enabled/"
echo "4. Get SSL certificate: sudo certbot --nginx -d api.hashpass.tech"
echo "5. Start Directus: cd /opt/hashpass && docker compose up -d"
echo "6. Run migrations: cd /opt/hashpass/db && flyway migrate"

echo -e "\n${GREEN}Server is ready for HashPass deployment!${NC}"
