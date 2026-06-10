#!/bin/bash
# Script to create Lambda function for HashPass API
# Requires: lambda-deployment.zip and IAM Role

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
PACKAGE_SCRIPT="$SCRIPT_DIR/package-lambda.sh"
DEPLOYMENT_ZIP="$PROJECT_ROOT/lambda-deployment.zip"

echo "🚀 Creating Lambda Function for HashPass API"
echo "============================================="
echo ""

FUNCTION_NAME="hashpass-api-handler"
REGION="us-east-1"
RUNTIME="nodejs20.x"
HANDLER="index.handler"
TIMEOUT=30
MEMORY=512

# Check if deployment package exists
if [ ! -f "$DEPLOYMENT_ZIP" ]; then
    echo "❌ lambda-deployment.zip not found!"
    echo "   Run: $PACKAGE_SCRIPT"
    exit 1
fi

# Check if function already exists
if aws lambda get-function --function-name $FUNCTION_NAME --region $REGION &>/dev/null; then
    echo "⚠️  Lambda function '$FUNCTION_NAME' already exists"
    echo ""
    read -p "Do you want to update it? (y/n) " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "📦 Updating Lambda function code..."
        aws lambda update-function-code \
          --function-name $FUNCTION_NAME \
          --zip-file "fileb://$DEPLOYMENT_ZIP" \
          --region $REGION
        
        echo ""
        echo "✅ Lambda function updated!"
        exit 0
    else
        echo "❌ Aborted"
        exit 1
    fi
fi

# Get IAM Role ARN
ROLE_NAME="hashpass-lambda-execution-role"
ROLE_ARN=$(aws iam get-role --role-name $ROLE_NAME --query 'Role.Arn' --output text 2>/dev/null || echo "")

if [ -z "$ROLE_ARN" ]; then
    echo "❌ IAM Role '$ROLE_NAME' not found!"
    echo "   Run: $SCRIPT_DIR/create-lambda-role.sh"
    exit 1
fi

echo "✅ Using IAM Role: $ROLE_ARN"
echo ""

# Create Lambda function
echo "📦 Creating Lambda function..."
echo "   Function Name: $FUNCTION_NAME"
echo "   Runtime: $RUNTIME"
echo "   Handler: $HANDLER"
echo "   Timeout: ${TIMEOUT}s"
echo "   Memory: ${MEMORY}MB"
echo ""

aws lambda create-function \
  --function-name $FUNCTION_NAME \
  --runtime $RUNTIME \
  --role $ROLE_ARN \
  --handler $HANDLER \
  --zip-file "fileb://$DEPLOYMENT_ZIP" \
  --timeout $TIMEOUT \
  --memory-size $MEMORY \
  --region $REGION \
  --description "HashPass API handler using Expo Server" \
  --environment Variables={NODE_ENV=production}

echo ""
echo "✅ Lambda function created successfully!"
echo ""
echo "📝 Function Details:"
FUNCTION_ARN=$(aws lambda get-function --function-name $FUNCTION_NAME --region $REGION --query 'Configuration.FunctionArn' --output text)
echo "   Function ARN: $FUNCTION_ARN"
echo ""
echo "📚 Next steps:"
echo "   1. Configure API Gateway (see docs/API-GATEWAY-SETUP.md)"
echo "   2. Test the function: aws lambda invoke --function-name $FUNCTION_NAME --region $REGION /tmp/hashpass-lambda-response.json"
echo ""
