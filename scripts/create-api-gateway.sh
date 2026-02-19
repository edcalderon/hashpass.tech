#!/bin/bash
# Script to create API Gateway REST API and configure it for HashPass
# This automates the API Gateway setup process

set -e

echo "🌐 Creating API Gateway for HashPass API"
echo "========================================="
echo ""

API_NAME="hashpassApi"
REGION="us-east-1"
STAGE_NAME="prod"
LAMBDA_FUNCTION_NAME="hashpass-api-handler"

# Check if Lambda function exists
if ! aws lambda get-function --function-name $LAMBDA_FUNCTION_NAME --region $REGION &>/dev/null; then
    echo "❌ Lambda function '$LAMBDA_FUNCTION_NAME' not found!"
    echo "   Run: ./scripts/create-lambda-function.sh"
    exit 1
fi

LAMBDA_ARN=$(aws lambda get-function --function-name $LAMBDA_FUNCTION_NAME --region $REGION --query 'Configuration.FunctionArn' --output text)
echo "✅ Lambda Function: $LAMBDA_ARN"
echo ""

# Check if API Gateway already exists
EXISTING_API=$(aws apigateway get-rest-apis --region $REGION --query "items[?name=='$API_NAME']" --output json 2>/dev/null || echo "[]")
API_ID=$(echo "$EXISTING_API" | jq -r '.[0].id' 2>/dev/null || echo "")

if [ ! -z "$API_ID" ] && [ "$API_ID" != "null" ]; then
    echo "⚠️  API Gateway '$API_NAME' already exists (ID: $API_ID)"
    read -p "Do you want to recreate it? (y/n) " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Using existing API Gateway..."
    else
        echo "Deleting existing API Gateway..."
        aws apigateway delete-rest-api --rest-api-id $API_ID --region $REGION
        API_ID=""
    fi
fi

# Create API Gateway if it doesn't exist
if [ -z "$API_ID" ] || [ "$API_ID" == "null" ]; then
    echo "📝 Creating API Gateway: $API_NAME"
    API_RESPONSE=$(aws apigateway create-rest-api \
      --name $API_NAME \
      --description "HashPass API Gateway" \
      --endpoint-configuration types=REGIONAL \
      --region $REGION)
    
    API_ID=$(echo "$API_RESPONSE" | jq -r '.id')
    echo "✅ API Gateway created: $API_ID"
else
    echo "✅ Using existing API Gateway: $API_ID"
fi

echo ""
echo "📋 Getting root resource ID..."
ROOT_RESOURCE_ID=$(aws apigateway get-resources --rest-api-id $API_ID --region $REGION --query 'items[0].id' --output text)
echo "   Root Resource ID: $ROOT_RESOURCE_ID"

# Check if /api resource exists
echo ""
echo "📋 Checking for /api resource..."
API_RESOURCES=$(aws apigateway get-resources --rest-api-id $API_ID --region $REGION --query "items[?path=='/api']" --output json)
API_RESOURCE_ID=$(echo "$API_RESOURCES" | jq -r '.[0].id' 2>/dev/null || echo "")

if [ -z "$API_RESOURCE_ID" ] || [ "$API_RESOURCE_ID" == "null" ]; then
    echo "📝 Creating /api resource..."
    API_RESOURCE_RESPONSE=$(aws apigateway create-resource \
      --rest-api-id $API_ID \
      --parent-id $ROOT_RESOURCE_ID \
      --path-part api \
      --region $REGION)
    
    API_RESOURCE_ID=$(echo "$API_RESOURCE_RESPONSE" | jq -r '.id')
    echo "✅ /api resource created: $API_RESOURCE_ID"
else
    echo "✅ /api resource exists: $API_RESOURCE_ID"
fi

# Check if /api/{proxy+} resource exists
echo ""
echo "📋 Checking for /api/{proxy+} resource..."
PROXY_RESOURCES=$(aws apigateway get-resources --rest-api-id $API_ID --region $REGION --query "items[?path=='/api/{proxy+}']" --output json)
PROXY_RESOURCE_ID=$(echo "$PROXY_RESOURCES" | jq -r '.[0].id' 2>/dev/null || echo "")

if [ -z "$PROXY_RESOURCE_ID" ] || [ "$PROXY_RESOURCE_ID" == "null" ]; then
    echo "📝 Creating /api/{proxy+} resource..."
    PROXY_RESOURCE_RESPONSE=$(aws apigateway create-resource \
      --rest-api-id $API_ID \
      --parent-id $API_RESOURCE_ID \
      --path-part "{proxy+}" \
      --region $REGION)
    
    PROXY_RESOURCE_ID=$(echo "$PROXY_RESOURCE_RESPONSE" | jq -r '.id')
    echo "✅ /api/{proxy+} resource created: $PROXY_RESOURCE_ID"
else
    echo "✅ /api/{proxy+} resource exists: $PROXY_RESOURCE_ID"
fi

# Check if ANY method exists on /api/{proxy+}
echo ""
echo "📋 Checking for ANY method on /api/{proxy+}..."
EXISTING_METHOD=$(aws apigateway get-method --rest-api-id $API_ID --resource-id $PROXY_RESOURCE_ID --http-method ANY --region $REGION 2>/dev/null || echo "")

if [ -z "$EXISTING_METHOD" ]; then
    echo "📝 Creating ANY method..."
    
    # Create ANY method
    aws apigateway put-method \
      --rest-api-id $API_ID \
      --resource-id $PROXY_RESOURCE_ID \
      --http-method ANY \
      --authorization-type NONE \
      --region $REGION
    
    echo "✅ ANY method created"
    
    # Configure Lambda integration
    echo "📝 Configuring Lambda integration..."
    aws apigateway put-integration \
      --rest-api-id $API_ID \
      --resource-id $PROXY_RESOURCE_ID \
      --http-method ANY \
      --type AWS_PROXY \
      --integration-http-method POST \
      --uri "arn:aws:apigateway:$REGION:lambda:path/2015-03-31/functions/$LAMBDA_ARN/invocations" \
      --region $REGION
    
    echo "✅ Lambda integration configured"
    
    # Grant API Gateway permission to invoke Lambda
    echo "📝 Granting API Gateway permission to invoke Lambda..."
    aws lambda add-permission \
      --function-name $LAMBDA_FUNCTION_NAME \
      --statement-id "apigateway-invoke-$API_ID" \
      --action lambda:InvokeFunction \
      --principal apigateway.amazonaws.com \
      --source-arn "arn:aws:execute-api:$REGION:*:$API_ID/*/*" \
      --region $REGION 2>/dev/null || echo "   (Permission may already exist)"
    
    echo "✅ Permission granted"
else
    echo "✅ ANY method already exists"
fi

# Deploy API
echo ""
echo "📝 Deploying API to stage: $STAGE_NAME..."
aws apigateway create-deployment \
  --rest-api-id $API_ID \
  --stage-name $STAGE_NAME \
  --region $REGION \
  --description "Production deployment" 2>/dev/null || \
aws apigateway create-deployment \
  --rest-api-id $API_ID \
  --stage-name $STAGE_NAME \
  --region $REGION \
  --description "Production deployment update"

echo "✅ API deployed"
echo ""

# Get invoke URL
INVOKE_URL="https://$API_ID.execute-api.$REGION.amazonaws.com/$STAGE_NAME"
echo "✅ API Gateway configured successfully!"
echo ""
echo "📝 API Details:"
echo "   API ID: $API_ID"
echo "   Invoke URL: $INVOKE_URL"
echo "   Example: $INVOKE_URL/api/config/versions"
echo ""
echo "📚 Next steps:"
echo "   1. Test the API: curl $INVOKE_URL/api/config/versions"
echo "   2. Configure custom domain (see docs/API-GATEWAY-SETUP.md)"
echo "   3. Update DNS to point api.hashpass.tech to API Gateway"
echo ""

