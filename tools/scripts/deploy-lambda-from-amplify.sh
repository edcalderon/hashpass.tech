#!/bin/bash
# Script to deploy Lambda function from Amplify build
# This is called automatically during Amplify builds if enabled

set -e

echo "🚀 Deploying Lambda Function from Amplify Build"
echo "================================================"
echo ""

if [ "$AWS_BRANCH" = "develop" ]; then
    LAMBDA_FUNCTION_NAME="hashpass-api-dev"
else
    # Default to production if not develop
    LAMBDA_FUNCTION_NAME="hashpass-api-prod"
fi

REGION="us-east-1"

# Check if we're in an Amplify build environment
if [ -z "$AWS_BRANCH" ]; then
    echo "⚠️  Not in Amplify build environment (AWS_BRANCH not set)"
    echo "   Skipping Lambda deployment"
    exit 0
fi

echo "📋 Build Environment:"
echo "   Branch: $AWS_BRANCH"
echo "   App ID: ${AWS_APP_ID:-N/A}"
echo ""

# Check if Lambda package exists
if [ ! -f "lambda-deployment.zip" ]; then
    echo "📦 Packaging Lambda function..."
    ./scripts/package-lambda.sh || {
        echo "⚠️  Lambda packaging failed, skipping deployment"
        exit 0
    }
fi

if [ ! -f "lambda-deployment.zip" ]; then
    echo "⚠️  lambda-deployment.zip not found, skipping deployment"
    exit 0
fi

# Deploy Lambda
echo "📤 Deploying Lambda function: $LAMBDA_FUNCTION_NAME"
aws lambda update-function-code \
  --function-name $LAMBDA_FUNCTION_NAME \
  --region $REGION \
  --zip-file fileb://lambda-deployment.zip || {
    echo "⚠️  Lambda deployment failed"
    echo "   This is OK if Lambda doesn't exist or permissions are missing"
    exit 0
}

echo ""
echo "✅ Lambda function deployed successfully!"
echo ""

