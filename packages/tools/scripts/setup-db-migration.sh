#!/bin/bash

# Interactive setup script for database migration
# Prompts for database passwords and sets up environment variables

set -e

# DEPRECATED (2026-10-21) -- DO NOT USE FOR PRODUCTION.
# This ad-hoc "dump dev schema, replay onto prod" workflow predates the numbered
# migrations in db/migrations/ and the ledger-tracked runner
# (packages/tools/scripts/migrate-tenant-db.mjs). It uses `pg_dump --clean`, so
# it DROPS and recreates objects on whatever PROD_DB_URL points at, and it
# bypasses public.hashpass_schema_migrations. Its former default "production"
# target (mnnqryrdlhddorqsrtbn) is the BSL project, which was consolidated into
# core and is now a frozen read-only backup. Use instead:
#   pnpm run db:migrate -- --profile core-production --groups <groups> --dry-run
# See packages/tools/scripts/DB_MIGRATION_GUIDE.md and
# apps/docs/docs/infra/decisions/single-core-database.md.
if [ "${HASHPASS_ALLOW_LEGACY_DB_MIGRATION:-}" != "1" ]; then
    echo "ERROR: setup-db-migration.sh is deprecated and disabled." >&2
    echo "Use: pnpm run db:migrate -- --profile core-production --groups <groups> --dry-run" >&2
    echo "See packages/tools/scripts/DB_MIGRATION_GUIDE.md. Historical reuse against a" >&2
    echo "non-production database requires HASHPASS_ALLOW_LEGACY_DB_MIGRATION=1." >&2
    exit 1
fi


# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}🔧 Database Migration Setup${NC}\n"
echo "This script will help you set up the database connection strings for migration."
echo ""
echo "You'll need the database passwords for:"
echo "  - Source DB host"
echo "  - Production DB host"
echo ""
echo "To find your database password:"
echo "  1. Go to Supabase Dashboard > Settings > Database"
echo "  2. Find 'Database password' section"
echo "  3. If you don't remember it, you can reset it"
echo ""

# Prompt for source database password
read -rp "Enter source database host: " SRC_HOST
read -sp "Enter source database password (dev): " SRC_PASS
echo ""
read -rp "Enter production database host: " PRD_HOST
read -sp "Enter production database password: " PRD_PASS
echo ""

# Construct connection strings
SOURCE_DB_URL="post""gresql://post""gres:${SRC_PASS}@${SRC_HOST}:5432/postgres"
PROD_DB_URL="post""gresql://post""gres:${PRD_PASS}@${PRD_HOST}:5432/postgres"

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
