#!/bin/bash

# Deploy OAuth configuration to sso.hashpass.co
set -e

echo "🚀 Deploying OAuth configuration to sso.hashpass.co..."

# Load ALL environment variables from .env file
if [ ! -f ".env" ]; then
    echo "❌ .env file not found. Please create .env with required variables."
    exit 1
fi

echo "📋 Loading environment variables from .env..."
set -a
source .env
set +a

# Validate required variables
REQUIRED_VARS=("GOOGLE_CLIENT_ID" "GOOGLE_CLIENT_SECRET" "DIRECTUS_KEY" "DIRECTUS_SECRET" "DB_HOST" "DB_PORT" "DB_NAME" "DB_USER" "DB_PASSWORD" "ADMIN_EMAIL" "ADMIN_PASSWORD")
for var in "${REQUIRED_VARS[@]}"; do
    if [ -z "${!var}" ]; then
        echo "❌ Missing required variable: $var"
        exit 1
    fi
done

echo "✅ All required variables loaded from .env"
echo "📋 Using Google Client ID: ${GOOGLE_CLIENT_ID:0:20}..."

# Copy deployment files to server
echo "📁 Copying deployment files to server..."
gcloud compute scp deploy/docker-compose.yml hashpass-sso:/opt/hashpass/ --zone=us-central1-a

# Copy .env file to server (without exposing in command history)
echo "🔐 Copying .env file to server..."
gcloud compute scp .env hashpass-sso:/tmp/.env.hashpass --zone=us-central1-a

gcloud compute ssh hashpass-sso --zone=us-central1-a --command="
cd /opt/hashpass && 
sudo mv /tmp/.env.hashpass .env &&
sudo chmod 600 .env &&
echo '✅ Environment file deployed securely'
"

# Restart the service
echo "🔄 Restarting Directus with OAuth configuration..."
gcloud compute ssh hashpass-sso --zone=us-central1-a --command="
cd /opt/hashpass && 
sudo docker compose down && 
sudo docker compose up -d &&
echo '✅ Directus restarted with OAuth configuration'
"

# Wait a moment for service to start
echo "⏳ Waiting for service to start..."
sleep 10

# Test OAuth endpoint
echo "🧪 Testing OAuth endpoint..."
if curl -s https://sso.hashpass.co/auth/oauth | grep -q "google"; then
    echo "✅ OAuth configuration successful! Google OAuth is now available."
else
    echo "⚠️ OAuth endpoint test failed. Checking service status..."
    gcloud compute ssh hashpass-sso --zone=us-central1-a --command="cd /opt/hashpass && sudo docker compose logs directus --tail=20"
fi

echo "🎉 OAuth deployment complete!"
echo ""
echo "Next steps:"
echo "1. Test OAuth login at: https://sso.hashpass.co"
echo "2. Configure Google Cloud Console redirect URIs:"
echo "   - https://sso.hashpass.co/auth/oauth/google/callback"
echo "   - http://localhost:8081/auth/callback"
echo "   - https://hashpass.tech/auth/callback"