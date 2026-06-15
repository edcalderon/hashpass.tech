#!/bin/bash
# Script to verify API Gateway configuration
# This helps diagnose 404 errors on api.hashpass.tech

set -e

echo "🔍 Verifying API Gateway Configuration for api.hashpass.tech"
echo ""

# Check if AWS CLI is installed
if ! command -v aws &> /dev/null; then
    echo "❌ AWS CLI is not installed. Please install it first."
    exit 1
fi

# Check if AWS credentials are configured
if ! aws sts get-caller-identity &> /dev/null; then
    echo "❌ AWS credentials not configured. Please run 'aws configure' first."
    exit 1
fi

echo "✅ AWS CLI configured"
echo ""

# List API Gateways
echo "📋 Available API Gateways:"
aws apigateway get-rest-apis --query 'items[*].[id,name]' --output table || echo "⚠️  Could not list API Gateways"
echo ""

# List Lambda functions
echo "📋 Available Lambda Functions:"
aws lambda list-functions --query 'Functions[*].[FunctionName,Runtime,LastModified]' --output table || echo "⚠️  Could not list Lambda functions"
echo ""

# Check custom domains
echo "📋 API Gateway Custom Domains:"
aws apigatewayv2 get-domain-names --query 'Items[*].[DomainName,DomainNameStatus]' --output table || echo "⚠️  Could not list custom domains"
echo ""

# Check DNS resolution
echo "🌐 DNS Resolution for api.hashpass.tech:"
if command -v dig &> /dev/null; then
    dig +short api.hashpass.tech || echo "⚠️  DNS not resolving"
else
    nslookup api.hashpass.tech || echo "⚠️  DNS not resolving"
fi
echo ""

echo "📝 Next Steps:"
echo "1. Verify API Gateway has route /api/{proxy+} configured"
echo "2. Verify Lambda function is deployed and has latest code"
echo "3. Verify custom domain 'api.hashpass.tech' is mapped to API Gateway"
echo "4. Check CloudWatch logs for errors"
echo ""
echo "See apps/docs/docs/infra/api-gateway/API-GATEWAY-TROUBLESHOOTING.md for detailed instructions"
