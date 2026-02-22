#!/bin/bash
# Script to package Lambda function for deployment
# This creates a deployment-ready zip file

set -e

echo "📦 Packaging Lambda Function for Deployment"
echo "==========================================="
echo ""

# Resolve build directory (prefer fresh app build output)
BUILD_DIR=""
if [ -d "apps/web-app/dist/server" ]; then
    BUILD_DIR="apps/web-app/dist"
elif [ -d "dist/server" ]; then
    BUILD_DIR="dist"
else
    echo "❌ Build output not found. Expected apps/web-app/dist/server or dist/server."
    echo "   Run: pnpm --filter hashpass-web-app build"
    exit 1
fi

echo "0. Using build output from: ${BUILD_DIR}"

# Create temporary directory for packaging
PACKAGE_DIR="lambda-package"
echo "1. Creating package directory..."
rm -rf $PACKAGE_DIR
mkdir -p $PACKAGE_DIR

# Copy Lambda handler
echo "2. Copying Lambda handler..."
cp lambda/index.js $PACKAGE_DIR/
cp lambda/package.json $PACKAGE_DIR/

# Copy server build
echo "3. Copying server build..."
cp -r "${BUILD_DIR}/server" "$PACKAGE_DIR/server"

# Copy config files needed by API routes
echo "3a. Copying config files..."
mkdir -p $PACKAGE_DIR/config
if [ -f "${BUILD_DIR}/config/versions.json" ]; then
  cp "${BUILD_DIR}/config/versions.json" "$PACKAGE_DIR/config/"
elif [ -f "config/versions.json" ]; then
  cp "config/versions.json" "$PACKAGE_DIR/config/"
fi
# Note: We do NOT copy the root package.json as it has incompatible dependencies
# The lambda/package.json already has the minimal dependencies needed

# Install dependencies
echo "4. Installing dependencies..."
cd $PACKAGE_DIR
npm install --production --verbose

# Create deployment package
echo "5. Creating deployment zip..."
cd ..
# Zip contents of package directory, not the directory itself
cd $PACKAGE_DIR
zip -r ../lambda-deployment.zip . -x "*.git*" "*.DS_Store*" "*.map" > /dev/null
cd ..

# Cleanup
echo "6. Cleaning up..."
rm -rf $PACKAGE_DIR

echo ""
echo "✅ Lambda package created: lambda-deployment.zip"
echo ""
echo "📝 Next steps:"
echo "   1. Create Lambda function (see docs/API-GATEWAY-SETUP.md)"
echo "   2. Upload lambda-deployment.zip to Lambda"
echo "   3. Configure API Gateway"
echo ""
