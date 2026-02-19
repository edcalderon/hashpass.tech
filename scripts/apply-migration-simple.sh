#!/bin/bash
# Simple script to apply migration using Supabase CLI with password

export SUPABASE_DB_PASSWORD='CXwWkBUnb3AYwQZ5'

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


