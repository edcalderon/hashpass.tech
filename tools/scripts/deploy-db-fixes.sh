#!/bin/bash
# Deploy Database Fixes to Supabase
# This script applies critical fixes for the Directus migration

set -e

echo "🚀 Deploying Database Fixes to Supabase"
echo "========================================"
echo ""

# Check if supabase CLI is installed
if ! command -v supabase &> /dev/null; then
    echo "❌ Supabase CLI not found. Install it first:"
    echo "   npm install -g supabase"
    exit 1
fi

echo "📋 What this script will do:"
echo "   1. Create event_agenda table (missing table causing 500 errors)"
echo "   2. Verify critical RPC functions exist"
echo "   3. Fix RLS policies for public read access"
echo ""

read -p "Continue? (y/n) " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 1
fi

echo ""
echo "🔍 Checking Supabase connection..."

# Check if linked to a project
if ! supabase status &> /dev/null; then
    echo "❌ Not linked to a Supabase project"
    echo ""
    echo "Run: supabase link --project-ref YOUR_PROJECT_REF"
    echo "Or: supabase login"
    exit 1
fi

echo "✅ Connected to Supabase"
echo ""

echo "📤 Applying migrations..."
echo ""

# Apply the migrations
supabase db push

echo ""
echo "✅ Migrations applied successfully!"
echo ""

echo "🧪 Running verification checks..."
echo ""

# Run the check script
npx tsx scripts/check-rpc-functions.ts

echo ""
echo "✅ Deployment complete!"
echo ""
echo "Next steps:"
echo "  1. Test the app - login via Directus"
echo "  2. Check agenda loads without 500 errors"
echo "  3. Verify passes are created for new users"
echo ""
