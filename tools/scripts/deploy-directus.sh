#!/bin/bash

# Deploy Directus SSO with updated configuration
# This script:
# 1. Stops the current Directus container
# 2. Removes the old container
# 3. Starts a new container with the updated docker-compose.yml

set -e

echo "🚀 Deploying Directus SSO updates..."

# Check if docker-compose is available
if ! command -v docker-compose &> /dev/null; then
    echo "❌ docker-compose not found. Please install it first."
    exit 1
fi

# Stop and remove the current container
echo "🛑 Stopping Directus container..."
docker-compose stop directus || true
docker-compose rm -f directus || true

# Start the container with new configuration
echo "🔄 Starting Directus with updated configuration..."
docker-compose up -d directus

# Wait for container to be healthy
echo "⏳ Waiting for Directus to be ready..."
sleep 5

# Check if container is running
if docker ps | grep -q hashpass-directus-sso; then
    echo "✅ Directus SSO deployed successfully!"
    echo "📝 oauth-callback.html should now be accessible at https://sso.hashpass.co/oauth-callback.html"
    echo ""
    echo "🔗 Test the endpoint:"
    echo "   curl -I https://sso.hashpass.co/oauth-callback.html"
else
    echo "❌ Directus container failed to start"
    echo "📋 Check logs:"
    echo "   docker logs hashpass-directus-sso"
    exit 1
fi
