#!/bin/bash
# Simple script to apply migration using Supabase CLI with password from .env

# Load .env file
if [ ! -f .env ]; then
    echo "❌ .env file not found. Please create .env with DB_PASSWORD_SOURCE"
    exit 1
fi

set -a
source .env
set +a

if [ -z "$DB_PASSWORD_SOURCE" ]; then
    echo "❌ DB_PASSWORD_SOURCE not found in .env file"
    exit 1
fi

export SUPABASE_DB_PASSWORD="$DB_PASSWORD_SOURCE"

# Move .env temporarily to avoid parsing errors
if [ -f .env ]; then
    mv .env .env.backup
    trap "mv .env.backup .env" EXIT
fi

echo "🔄 Applying migration..."
echo ""

# Try to apply just the new migration
supabase db push --password "$SUPABASE_DB_PASSWORD" --include-all 2>&1

echo ""
echo "✅ Done!"


