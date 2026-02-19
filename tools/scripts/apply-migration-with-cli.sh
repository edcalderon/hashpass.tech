#!/bin/bash
# Script to apply migration using Supabase CLI
# Usage: ./scripts/apply-migration-with-cli.sh

set -e

echo "🔄 Applying migration using Supabase CLI..."
echo ""

# Check if password is provided
if [ -z "$SUPABASE_DB_PASSWORD" ]; then
    echo "⚠️  SUPABASE_DB_PASSWORD not set in environment"
    echo "Please provide your database password:"
    read -sp "Database password: " SUPABASE_DB_PASSWORD
    echo ""
    export SUPABASE_DB_PASSWORD
fi

# Temporarily move .env if it has parsing issues
if [ -f .env ]; then
    mv .env .env.backup
    trap "mv .env.backup .env" EXIT
fi

# Apply migrations
echo "📤 Pushing migrations to Supabase..."
supabase db push --password "$SUPABASE_DB_PASSWORD" --include-all

echo ""
echo "✅ Migration applied successfully!"


