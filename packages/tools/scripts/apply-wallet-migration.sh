#!/bin/bash
# Script to apply wallet authentication migration using Supabase CLI
# Usage: ./scripts/apply-wallet-migration.sh

set -e

# DEPRECATED (2026-10-21) -- DO NOT USE. Early one-off migration applier that
# defaults to the legacy Supabase project tgbdilebadmzqwubsijr and bypasses the
# numbered migrations and the ledger public.hashpass_schema_migrations. Use
# `pnpm run db:migrate -- --profile <profile> --groups <groups> --dry-run`
# (production profile: core-production). Disabled unless
# HASHPASS_ALLOW_LEGACY_DB_MIGRATION=1 (never for a production database). See
# packages/tools/scripts/README.md#deprecated-database-scripts.
if [ "${HASHPASS_ALLOW_LEGACY_DB_MIGRATION:-}" != "1" ]; then
  echo "ERROR: apply-wallet-migration.sh is deprecated and disabled." >&2
  echo "Use: pnpm run db:migrate -- --profile core-production --groups wallet --dry-run" >&2
  exit 1
fi

echo "🔧 Applying wallet authentication migration..."
echo ""

# Check if .env exists and has the password
if [ -f .env ]; then
    # Try to extract password from .env
    DB_PASSWORD=$(grep "SUPABASE_DB_PASSWORD" .env | cut -d '=' -f2 | tr -d '"' | tr -d "'" | xargs)
    
    if [ -z "$DB_PASSWORD" ]; then
        echo "❌ Could not find SUPABASE_DB_PASSWORD in .env file"
        echo "   Please set it manually or enter when prompted"
        read -sp "Enter database password: " DB_PASSWORD
        echo ""
    else
        echo "✅ Found database password in .env"
    fi
else
    read -sp "Enter database password: " DB_PASSWORD
    echo ""
fi

# Temporarily move .env to avoid parsing errors
if [ -f .env ]; then
    mv .env .env.backup
    trap "mv .env.backup .env" EXIT
fi

# Try to push migrations
echo "📤 Pushing migrations to Supabase..."
if supabase db push --password "$DB_PASSWORD" 2>&1; then
    echo ""
    echo "✅ Migration applied successfully!"
    echo ""
    echo "The following have been created:"
    echo "  - wallet_type enum"
    echo "  - wallet_auth table"
    echo "  - wallet_auth_rate_limits table"
    echo "  - check_wallet_auth_rate_limit() function"
    echo "  - cleanup_expired_rate_limits() function"
else
    echo ""
    echo "❌ Migration failed. Please try one of these alternatives:"
    echo ""
    echo "Option 1: Supabase Dashboard (Recommended)"
    echo "  1. Go to: https://supabase.com/dashboard/project/tgbdilebadmzqwubsijr/sql/new"
    echo "  2. Copy the contents of: supabase/migrations/20250123000000_create_wallet_auth.sql"
    echo "  3. Paste and click 'Run'"
    echo ""
    echo "Option 2: Install psql and run:"
    echo "  psql \"postgresql://postgres:<PASSWORD>@db.tgbdilebadmzqwubsijr.supabase.co:5432/postgres\" \\"
    echo "    -f supabase/migrations/20250123000000_create_wallet_auth.sql"
    echo ""
    exit 1
fi

