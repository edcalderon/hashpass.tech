#!/bin/bash
# Deploy script for Cloudflare Pages
# This script builds and deploys the app to Cloudflare Pages

set -e

echo "🚀 Building HashPass for Cloudflare Pages..."
npm run build:web

echo "📦 Deploying to Cloudflare Pages..."
npx wrangler pages deploy ./dist/client --project-name=hashpass

echo "✅ Deployment complete!"
echo ""
echo "Your app should be available at: https://hashpass.pages.dev"
echo "Or your custom domain if configured in Cloudflare Dashboard"

