#!/bin/bash
# Script to package Lambda function for deployment
# This creates a deployment-ready zip file

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"

echo "📦 Packaging Lambda Function for Deployment"
echo "==========================================="
echo ""

# Resolve build directory (prefer the app Expo server bundle for API routes)
BUILD_DIR=""
if [ -d "$PROJECT_ROOT/apps/mobile-app/dist/server" ]; then
    BUILD_DIR="$PROJECT_ROOT/apps/mobile-app/dist/server"
elif [ -d "$PROJECT_ROOT/apps/mobile-app/dist/client" ]; then
    BUILD_DIR="$PROJECT_ROOT/apps/mobile-app/dist/client"
elif [ -d "$PROJECT_ROOT/dist/server" ]; then
    BUILD_DIR="$PROJECT_ROOT/dist/server"
elif [ -d "$PROJECT_ROOT/dist/client" ]; then
    BUILD_DIR="$PROJECT_ROOT/dist/client"
elif [ -d "$PROJECT_ROOT/apps/mobile-app/dist" ]; then
    BUILD_DIR="$PROJECT_ROOT/apps/mobile-app/dist"
elif [ -d "$PROJECT_ROOT/dist" ]; then
    BUILD_DIR="$PROJECT_ROOT/dist"
else
    echo "❌ Build output not found. Expected dist/server, apps/mobile-app/dist/server, dist/client, apps/mobile-app/dist/client, apps/mobile-app/dist, or dist."
    echo "   Run: pnpm --filter hashpass-mobile-app build"
    exit 1
fi

echo "0. Using build output from: ${BUILD_DIR}"

# Create temporary directory for packaging
PACKAGE_DIR="$PROJECT_ROOT/lambda-package"
echo "1. Creating package directory..."
rm -rf "$PACKAGE_DIR"
mkdir -p "$PACKAGE_DIR"

# Copy Lambda handler
echo "2. Copying Lambda handler..."
cp "$PROJECT_ROOT/packages/infra/lambda/index.js" "$PACKAGE_DIR/"
cp "$PROJECT_ROOT/packages/infra/lambda/package.json" "$PACKAGE_DIR/"

# Copy the Expo server bundle into the Lambda server root.
echo "3. Copying build output into Lambda server root..."
cp -r "$BUILD_DIR" "$PACKAGE_DIR/server"

BETTER_AUTH_ROUTE="$PACKAGE_DIR/server/_expo/functions/api/auth/[...auth]+api.js"
if [ ! -f "$BETTER_AUTH_ROUTE" ]; then
  echo "❌ Better Auth API routes are missing from the Expo server export."
  echo "   Expected:"
  echo "   - $BETTER_AUTH_ROUTE"
  echo "   Re-run the web build and verify app/api/auth/[...auth]+api.ts is included."
  exit 1
fi

# Copy config files needed by API routes
echo "3a. Copying config files..."
mkdir -p "$PACKAGE_DIR/config"
if [ -f "${BUILD_DIR}/config/versions.json" ]; then
  cp "${BUILD_DIR}/config/versions.json" "$PACKAGE_DIR/config/"
elif [ -f "$PROJECT_ROOT/apps/mobile-app/config/versions.json" ]; then
  cp "$PROJECT_ROOT/apps/mobile-app/config/versions.json" "$PACKAGE_DIR/config/"
fi
# Note: We do NOT copy the root package.json as it has incompatible dependencies
# The packages/infra/lambda/package.json already has the minimal dependencies needed

# Install dependencies
echo "4. Installing dependencies..."
cd "$PACKAGE_DIR"
npm install --production --verbose

# Create deployment package
echo "5. Creating deployment zip..."
# Zip contents of package directory, not the directory itself
cd "$PACKAGE_DIR"
zip -r "$PROJECT_ROOT/lambda-deployment.zip" . -x "*.git*" "*.DS_Store*" "*.map" > /dev/null
cd "$PROJECT_ROOT"

# Cleanup
echo "6. Cleaning up..."
rm -rf "$PACKAGE_DIR"

echo ""
echo "✅ Lambda package created: lambda-deployment.zip"
echo ""
echo "📝 Next steps:"
echo "   1. Create Lambda function (see apps/docs/docs/infra/api-gateway/API-GATEWAY-SETUP.md)"
echo "   2. Upload lambda-deployment.zip to Lambda"
echo "   3. Configure API Gateway"
echo ""
