#!/bin/bash
# Script to package Lambda function for deployment
# This creates a deployment-ready zip file

set -e

echo "📦 Packaging Lambda Function for Deployment"
echo "==========================================="
echo ""

# Check if build exists
if [ ! -d "dist/server" ]; then
    echo "❌ dist/server not found. Please run 'npm run build:web' first."
    exit 1
fi

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
cp -r dist/server $PACKAGE_DIR/server

# Copy config files needed by API routes
echo "3a. Copying config files..."
mkdir -p $PACKAGE_DIR/config
if [ -f "config/versions.json" ]; then
  cp config/versions.json $PACKAGE_DIR/config/
fi
if [ -f "package.json" ]; then
  cp package.json $PACKAGE_DIR/
fi

# Install dependencies
echo "4. Installing dependencies..."
cd $PACKAGE_DIR
npm install --production --silent

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

