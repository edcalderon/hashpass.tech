#!/bin/bash

# Database Schema Migration Script (Docker Version)
# Migrates database structure (schema only, no data) from source to production Supabase instance.
# Uses Docker to run pg_dump and psql without requiring local PostgreSQL installation.
#
# Usage:
#   ./scripts/migrate-db-to-prod-docker.sh
#
# Environment Variables Required:
#   SOURCE_DB_URL - Source database connection string
#   PROD_DB_URL - Production database connection string

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Load .env file if it exists
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$PROJECT_ROOT/.env"

if [ -f "$ENV_FILE" ]; then
    echo -e "${BLUE}📄 Loading environment variables from .env file...${NC}"
    # Export variables from .env file
    # Read .env file line by line and export variables
    while IFS= read -r line || [ -n "$line" ]; do
        # Skip comments and empty lines
        [[ "$line" =~ ^[[:space:]]*# ]] && continue
        [[ -z "${line// }" ]] && continue
        
        # Extract key and value (handles quoted and unquoted values)
        if [[ "$line" =~ ^[[:space:]]*([^=]+)=(.*)$ ]]; then
            key="${BASH_REMATCH[1]// /}"
            value="${BASH_REMATCH[2]}"
            # Remove leading/trailing whitespace and quotes
            value="${value#"${value%%[![:space:]]*}"}"
            value="${value%"${value##*[![:space:]]}"}"
            value="${value#\"}"
            value="${value%\"}"
            value="${value#\'}"
            value="${value%\'}"
            export "$key=$value"
        fi
    done < "$ENV_FILE"
fi

# Source database (dev)
SOURCE_SUPABASE_URL="${SOURCE_SUPABASE_URL:-https://tgbdilebadmzqwubsijr.supabase.co}"
SOURCE_DB_URL="${SOURCE_DB_URL}"

# Production database
PROD_SUPABASE_URL="${PROD_SUPABASE_URL:-https://fxgftanraszjjyeidvia.supabase.co}"
PROD_DB_URL="${PROD_DB_URL}"

echo -e "${BLUE}🔄 Starting database migration (using Docker)...${NC}\n"
echo -e "Source: ${SOURCE_SUPABASE_URL}"
echo -e "Production: ${PROD_SUPABASE_URL}\n"

# Check if Docker is available
if ! command -v docker &> /dev/null; then
    echo -e "${RED}❌ Docker is not installed or not in PATH${NC}"
    echo -e "\nPlease install Docker:"
    echo -e "  https://docs.docker.com/get-docker/"
    exit 1
fi

# Validate environment variables
if [ -z "$SOURCE_DB_URL" ]; then
    echo -e "${RED}❌ SOURCE_DB_URL environment variable is required${NC}"
    echo -e "\n${YELLOW}To get the connection string:${NC}"
    echo -e "  1. Go to Source Supabase Dashboard > Settings > Database"
    echo -e "  2. Find 'Connection string' section"
    echo -e "  3. Select 'URI' and copy the connection string"
    echo -e "  4. Replace [YOUR-PASSWORD] with your database password"
    echo -e "\n${YELLOW}Then run:${NC}"
    echo -e "  export SOURCE_DB_URL=\"postgresql://postgres:[PASSWORD]@db.tgbdilebadmzqwubsijr.supabase.co:5432/postgres\""
    echo -e "  export PROD_DB_URL=\"postgresql://postgres:[PASSWORD]@db.fxgftanraszjjyeidvia.supabase.co:5432/postgres\""
    echo -e "  ./scripts/migrate-db-to-prod-docker.sh\n"
    exit 1
fi

if [ -z "$PROD_DB_URL" ]; then
    echo -e "${RED}❌ PROD_DB_URL environment variable is required${NC}"
    echo -e "\n${YELLOW}To get the connection string:${NC}"
    echo -e "  1. Go to Production Supabase Dashboard > Settings > Database"
    echo -e "  2. Find 'Connection string' section"
    echo -e "  3. Select 'URI' and copy the connection string"
    echo -e "  4. Replace [YOUR-PASSWORD] with your database password"
    echo -e "\n${YELLOW}Then run:${NC}"
    echo -e "  export SOURCE_DB_URL=\"postgresql://postgres:[PASSWORD]@db.tgbdilebadmzqwubsijr.supabase.co:5432/postgres\""
    echo -e "  export PROD_DB_URL=\"postgresql://postgres:[PASSWORD]@db.fxgftanraszjjyeidvia.supabase.co:5432/postgres\""
    echo -e "  ./scripts/migrate-db-to-prod-docker.sh\n"
    exit 1
fi

# Temporary schema file
SCHEMA_FILE=".temp-schema-dump.sql"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SCHEMA_FILE_PATH="$PROJECT_ROOT/$SCHEMA_FILE"

# Cleanup function
cleanup() {
    if [ -f "$SCHEMA_FILE_PATH" ]; then
        rm -f "$SCHEMA_FILE_PATH"
        echo -e "${GREEN}🧹 Cleaned up temporary files${NC}"
    fi
}

# Set trap to cleanup on exit
trap cleanup EXIT

# Parse and URL-encode connection string using Python (handles special chars in password)
# Supports both formats:
# - postgresql://postgres:[PASSWORD]@db.[PROJECT].supabase.co:5432/postgres
# - postgresql://postgres.[PROJECT]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:5432/postgres
encode_db_url() {
    local url="$1"
    # Remove quotes if present
    url="${url#\"}"
    url="${url%\"}"
    python3 - "$url" <<'PYTHON_SCRIPT'
import urllib.parse
import sys
import re

url = sys.argv[1]

if '://' not in url:
    print(url)
    sys.exit(0)

scheme, rest = url.split('://', 1)

if '@' not in rest:
    print(url)
    sys.exit(0)

# Split on @ to separate credentials from host/db
# Format: username:password@host:port/db
# The last @ is the delimiter between credentials and host
parts = rest.rsplit('@', 1)
if len(parts) != 2:
    print(url)
    sys.exit(0)

credentials_part = parts[0]
host_db_part = parts[1]

# Extract username and password from credentials_part
# Username can be: postgres or postgres.[PROJECT-REF]
if ':' in credentials_part:
    # Split on first : to separate username and password
    # Password may contain : so we only split on the first one
    username, password = credentials_part.split(':', 1)
    
    # URL-encode the password (handles @, %, :, and other special chars)
    encoded_password = urllib.parse.quote(password, safe='')
    
    # Reconstruct URL with encoded password
    new_url = f"{scheme}://{username}:{encoded_password}@{host_db_part}"
    print(new_url)
else:
    # No password, use as-is
    print(url)
PYTHON_SCRIPT
}

# Step 1: Extract schema from source database using Docker
echo -e "${BLUE}📦 Extracting schema from source database...${NC}"

# Parse and URL-encode the connection string
SOURCE_DB_URL_ENCODED=$(encode_db_url "$SOURCE_DB_URL")
echo -e "${YELLOW}Using encoded connection string...${NC}"

if docker run --rm -v "$PROJECT_ROOT:/data" \
    postgres:17 \
    pg_dump "$SOURCE_DB_URL_ENCODED" \
    --schema-only \
    --no-owner \
    --no-privileges \
    --no-tablespaces \
    --clean \
    --if-exists \
    -f "/data/$SCHEMA_FILE" 2>&1 | tee /tmp/pg_dump.log; then
    
    # Check if file was created (pg_dump might output to stdout)
    if [ ! -f "$SCHEMA_FILE_PATH" ]; then
        # Try alternative: redirect output to file
        docker run --rm \
            postgres:17 \
            pg_dump "$SOURCE_DB_URL" \
            --schema-only \
            --no-owner \
            --no-privileges \
            --no-tablespaces \
            --clean \
            --if-exists > "$SCHEMA_FILE_PATH"
    fi
    
    if [ -f "$SCHEMA_FILE_PATH" ] && [ -s "$SCHEMA_FILE_PATH" ]; then
        echo -e "${GREEN}✅ Schema extracted successfully${NC}"
    else
        echo -e "${RED}❌ Schema file is empty or not created${NC}"
        exit 1
    fi
else
    echo -e "${RED}❌ Error extracting schema${NC}"
    exit 1
fi

# Step 2: Apply schema to production database using Docker
echo -e "\n${BLUE}🚀 Applying schema to production database...${NC}"

# Parse and URL-encode production connection string
PROD_DB_URL_ENCODED=$(encode_db_url "$PROD_DB_URL")
echo -e "${YELLOW}Using encoded connection string...${NC}"

if docker run --rm -v "$SCHEMA_FILE_PATH:/schema.sql" \
    postgres:17 \
    psql "$PROD_DB_URL_ENCODED" -f /schema.sql -q; then
    echo -e "${GREEN}✅ Schema applied successfully${NC}"
else
    echo -e "${RED}❌ Error applying schema${NC}"
    exit 1
fi

echo -e "\n${GREEN}✅ Migration completed successfully!${NC}\n"
echo -e "${YELLOW}📝 Next steps:${NC}"
echo -e "  1. Verify tables, functions, and triggers in production database"
echo -e "  2. Check RLS policies are correctly applied"
echo -e "  3. Test RPC functions"
echo -e "  4. Update application environment variables to point to production\n"

