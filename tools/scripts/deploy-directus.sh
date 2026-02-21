#!/bin/bash
set -e

# Deploy Directus SSO with updated configuration
# This script uses the apps/directus configuration as the source of truth

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../" && pwd)"
DIRECTUS_DIR="$ROOT_DIR/apps/directus"

echo "🚀 Deploying Directus SSO updates [Context: $DIRECTUS_DIR]..."

# Check if docker-compose is available
if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    echo "❌ docker-compose not found. Please install it first."
    exit 1
fi

COMPOSE_CMD="docker-compose"
if ! command -v docker-compose &> /dev/null; then
    COMPOSE_CMD="docker compose"
fi

cd "$DIRECTUS_DIR"

# Ensure we have an .env file (should be propagated already)
if [ ! -f .env ]; then
    echo "⚠️  No .env found in $DIRECTUS_DIR. Attempting propagation..."
    node "$ROOT_DIR/tools/scripts/propagate-env.js" local
fi

# Stop and remove any conflicting containers with common names
echo "🛑 Cleaning up old Directus containers..."
$COMPOSE_CMD stop directus || true
$COMPOSE_CMD rm -f directus || true
docker stop hashpass-directus-sso hashpass-directus || true
docker rm -f hashpass-directus-sso hashpass-directus || true

# Start the container with new configuration
echo "🔄 Starting Directus with updated configuration..."
$COMPOSE_CMD up -d directus

# Wait for container to be healthy
echo "⏳ Waiting for Directus to be ready..."
sleep 5

# Check if container is running
if docker ps | grep -q "hashpass-directus-sso\|hashpass-directus"; then
    echo "✅ Directus SSO deployed successfully!"
else
    echo "❌ Directus container failed to start"
    echo "📋 Check logs: docker logs hashpass-directus-sso"
    exit 1
fi
