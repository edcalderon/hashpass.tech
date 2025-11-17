#!/bin/bash
# Script to set up API Gateway + Lambda for HashPass API routes
# This script helps automate the setup process

set -e

echo "🚀 Setting up API Gateway + Lambda for HashPass API Routes"
echo "=========================================================="
echo ""

# Check AWS CLI
if ! command -v aws &> /dev/null; then
    echo "❌ AWS CLI is not installed. Please install it first."
    exit 1
fi

# Check AWS credentials
if ! aws sts get-caller-identity &> /dev/null; then
    echo "❌ AWS credentials not configured. Please run 'aws configure' first."
    exit 1
fi

# Get region
REGION=$(aws configure get region 2>/dev/null || echo "us-east-1")
echo "📍 Using region: $REGION"
echo ""

# Check if Lambda function exists
FUNCTION_NAME="hashpass-api-handler"
echo "🔍 Checking for Lambda function: $FUNCTION_NAME"
EXISTING_FUNCTION=$(aws lambda get-function --function-name $FUNCTION_NAME --region $REGION 2>/dev/null || echo "")

if [ -z "$EXISTING_FUNCTION" ]; then
    echo "   ⚠️  Lambda function does not exist"
    echo ""
    echo "📦 Step 1: Prepare Lambda deployment package"
    echo "   - Build the project: npm run build:web"
    echo "   - See docs/API-GATEWAY-SETUP.md for detailed packaging instructions"
    echo ""
    echo "📝 Step 2: Create Lambda function"
    echo "   Run: aws lambda create-function \\"
    echo "     --function-name $FUNCTION_NAME \\"
    echo "     --runtime nodejs20.x \\"
    echo "     --role arn:aws:iam::ACCOUNT_ID:role/lambda-execution-role \\"
    echo "     --handler index.handler \\"
    echo "     --zip-file fileb://lambda-deployment.zip \\"
    echo "     --region $REGION"
    echo ""
    echo "   ⚠️  You need to:"
    echo "   1. Create IAM role for Lambda with execution permissions"
    echo "   2. Build and package the Lambda function"
    echo "   3. Create the function"
else
    echo "   ✅ Lambda function exists"
    echo ""
fi

# Check for API Gateway
echo "🔍 Checking for API Gateway..."
REST_APIS=$(aws apigateway get-rest-apis --region $REGION --query 'items[?name==`hashpassApi`]' --output json 2>/dev/null || echo "[]")

if [ "$REST_APIS" = "[]" ] || [ -z "$REST_APIS" ]; then
    echo "   ⚠️  API Gateway does not exist"
    echo ""
    echo "📝 Step 3: Create API Gateway"
    echo "   Run: aws apigateway create-rest-api \\"
    echo "     --name hashpassApi \\"
    echo "     --description 'HashPass API Gateway' \\"
    echo "     --region $REGION"
    echo ""
    echo "   Then configure:"
    echo "   1. Create resource /api"
    echo "   2. Create resource /api/{proxy+}"
    echo "   3. Create ANY method on /api/{proxy+}"
    echo "   4. Configure Lambda integration"
    echo "   5. Deploy to stage (prod)"
else
    echo "   ✅ API Gateway exists"
    API_ID=$(echo "$REST_APIS" | jq -r '.[0].id' 2>/dev/null || echo "")
    if [ ! -z "$API_ID" ]; then
        echo "   API ID: $API_ID"
    fi
    echo ""
fi

# Check for custom domain
echo "🔍 Checking for custom domain: api.hashpass.tech"
CUSTOM_DOMAIN=$(aws apigatewayv2 get-domain-name --domain-name api.hashpass.tech --region $REGION 2>/dev/null || echo "")

if [ -z "$CUSTOM_DOMAIN" ]; then
    echo "   ⚠️  Custom domain not configured"
    echo ""
    echo "📝 Step 4: Configure Custom Domain"
    echo "   Prerequisites:"
    echo "   - ACM certificate for *.hashpass.tech or hashpass.tech in region $REGION"
    echo ""
    echo "   Run: aws apigatewayv2 create-domain-name \\"
    echo "     --domain-name api.hashpass.tech \\"
    echo "     --domain-name-configurations CertificateArn=arn:aws:acm:REGION:ACCOUNT:certificate/CERT_ID \\"
    echo "     --region $REGION"
    echo ""
    echo "   Then:"
    echo "   1. Create API mapping to your API Gateway"
    echo "   2. Get the target domain name"
    echo "   3. Update DNS CNAME record"
else
    echo "   ✅ Custom domain exists"
    TARGET_DOMAIN=$(echo "$CUSTOM_DOMAIN" | jq -r '.DomainNameConfigurations[0].TargetDomainName' 2>/dev/null || echo "N/A")
    echo "   Target Domain: $TARGET_DOMAIN"
    echo ""
fi

echo "📚 For detailed step-by-step instructions, see:"
echo "   - docs/API-GATEWAY-TROUBLESHOOTING.md"
echo "   - docs/API-GATEWAY-SETUP.md (if exists)"
echo ""

