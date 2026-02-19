#!/bin/bash

# Interactive setup script for database migration
# Prompts for database passwords and sets up environment variables

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}🔧 Database Migration Setup${NC}\n"
echo "This script will help you set up the database connection strings for migration."
echo ""
echo "You'll need the database passwords for:"
echo "  - Source DB (Dev): https://tgbdilebadmzqwubsijr.supabase.co"
echo "  - Production DB: https://fxgftanraszjjyeidvia.supabase.co"
echo ""
echo "To find your database password:"
echo "  1. Go to Supabase Dashboard > Settings > Database"
echo "  2. Find 'Database password' section"
echo "  3. If you don't remember it, you can reset it"
echo ""

# Prompt for source database password
read -sp "Enter source database password (dev): " SOURCE_PASSWORD
echo ""
read -sp "Enter production database password: " PROD_PASSWORD
echo ""

# Construct connection strings
SOURCE_DB_URL="postgresql://postgres:${SOURCE_PASSWORD}@db.tgbdilebadmzqwubsijr.supabase.co:5432/postgres"
PROD_DB_URL="postgresql://postgres:${PROD_PASSWORD}@db.fxgftanraszjjyeidvia.supabase.co:5432/postgres"

# Export variables
export SOURCE_DB_URL
export PROD_DB_URL

echo -e "\n${GREEN}✅ Environment variables set!${NC}"
echo ""
echo "You can now run the migration:"
echo -e "  ${YELLOW}./scripts/migrate-db-to-prod-docker.sh${NC}"
echo ""
echo "Or run it now? (y/n)"
read -r response
if [[ "$response" =~ ^[Yy]$ ]]; then
    ./scripts/migrate-db-to-prod-docker.sh
fi


