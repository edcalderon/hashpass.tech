#!/bin/bash
# Switch HashPass environment configuration
# Usage: ./switch-env.sh local|staging|production

set -e

ENV=${1:-local}
WEB_APP_DIR="apps/web-app"

# Validate argument
case "$ENV" in
  local|staging|production)
    ;;
  *)
    echo "❌ Invalid environment: $ENV"
    echo ""
    echo "Usage: $0 local|staging|production"
    echo ""
    echo "Environments:"
    echo "  local       - Local development with Docker Directus"
    echo "  staging     - Staging environment"
    echo "  production  - Production environment"
    exit 1
    ;;
esac

# Check if files exist
if [ ! -f "$WEB_APP_DIR/.env.$ENV" ]; then
  echo "❌ Environment file not found: $WEB_APP_DIR/.env.$ENV"
  exit 1
fi

# Backup current .env if it exists
if [ -f "$WEB_APP_DIR/.env" ]; then
  CURRENT=$(grep -m1 "^DIRECTUS_URL=" "$WEB_APP_DIR/.env" | cut -d'=' -f2)
  echo "📦 Preserving current .env"
fi

# Switch environment
cp "$WEB_APP_DIR/.env.$ENV" "$WEB_APP_DIR/.env"

# Display new configuration
NEW_URL=$(grep "^DIRECTUS_URL=" "$WEB_APP_DIR/.env" | cut -d'=' -f2)
echo ""
echo "✅ Switched to $ENV environment"
echo ""
echo "Configuration:"
cat "$WEB_APP_DIR/.env" | grep -E "^(EXPO_PUBLIC|DIRECTUS)" | sed 's/^/  /'
echo ""

case "$ENV" in
  local)
    echo "📝 Next steps:"
    echo "  1. Start Directus: cd apps/directus && docker-compose up -d"
    echo "  2. Start web app: pnpm run dev"
    echo "  3. Open browser: http://localhost:8081"
    ;;
  staging)
    echo "📝 Next steps:"
    echo "  1. Start web app: pnpm run dev"
    echo "  2. Open browser: http://localhost:8081"
    ;;
  production)
    echo "⚠️  Production environment loaded"
    echo "📝 Next steps:"
    echo "  1. Only use in production deployments"
    echo "  2. Never commit .env to version control"
    ;;
esac

echo ""
