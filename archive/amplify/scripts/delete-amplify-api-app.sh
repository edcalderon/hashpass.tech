#!/bin/bash
# Script to delete Amplify app for api.hashpass.tech
# This app is no longer needed since we're using API Gateway + Lambda

set -e

APP_ID="d31bu1ot0gd14y"
APP_NAME="api.hashpass.tech"
REGION="us-east-2"

echo "🗑️  Deleting Amplify App for api.hashpass.tech"
echo "=============================================="
echo ""
echo "⚠️  WARNING: This will permanently delete the Amplify app!"
echo "   App ID: $APP_ID"
echo "   App Name: $APP_NAME"
echo ""
echo "This is safe because:"
echo "  - api.hashpass.tech now uses API Gateway + Lambda"
echo "  - No frontend is needed for the API"
echo "  - The app is redundant"
echo ""

read -p "Are you sure you want to delete this app? (yes/no) " -r
echo ""

if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
    echo "❌ Aborted"
    exit 1
fi

# List branches first
echo "📋 Listing branches..."
BRANCHES=$(aws amplify list-branches --app-id $APP_ID --region $REGION --query 'branches[*].branchName' --output text 2>/dev/null || echo "")

if [ ! -z "$BRANCHES" ] && [ "$BRANCHES" != "None" ]; then
    echo "   Found branches: $BRANCHES"
    echo ""
    echo "⚠️  Deleting branches first..."
    for BRANCH in $BRANCHES; do
        echo "   Deleting branch: $BRANCH"
        aws amplify delete-branch --app-id $APP_ID --branch-name $BRANCH --region $REGION 2>/dev/null || echo "   (Branch may not exist or already deleted)"
    done
    echo ""
fi

# Delete the app
echo "🗑️  Deleting Amplify app: $APP_ID"
echo "   Region: $REGION"
aws amplify delete-app --app-id $APP_ID --region $REGION

echo ""
echo "✅ Amplify app deleted successfully!"
echo ""
echo "📋 Next steps:"
echo "   1. Update DNS: api.hashpass.tech → API Gateway"
echo "   2. Run: ./scripts/update-api-dns.sh (after certificate validation)"
echo ""

