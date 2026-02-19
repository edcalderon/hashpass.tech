#!/bin/bash
# Script to configure custom domain for API Gateway
# This requires an ACM certificate for the domain

set -e

echo "🌐 Configuring Custom Domain for API Gateway"
echo "=============================================="
echo ""

DOMAIN_NAME="api.hashpass.tech"
REGION="us-east-1"
API_ID="nqt8xep20g"  # From previous step
STAGE_NAME="prod"

# Check if custom domain already exists
EXISTING_DOMAIN=$(aws apigatewayv2 get-domain-name --domain-name $DOMAIN_NAME --region $REGION 2>/dev/null || echo "")

if [ ! -z "$EXISTING_DOMAIN" ]; then
    echo "⚠️  Custom domain '$DOMAIN_NAME' already exists"
    TARGET_DOMAIN=$(echo "$EXISTING_DOMAIN" | jq -r '.DomainNameConfigurations[0].TargetDomainName' 2>/dev/null || echo "N/A")
    echo "   Target Domain: $TARGET_DOMAIN"
    echo ""
    read -p "Do you want to recreate it? (y/n) " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Using existing domain..."
        exit 0
    fi
fi

# Check for ACM certificate
echo "🔍 Checking for ACM certificate..."
# Try to find certificate, or use the one we just created
CERT_ARN=$(aws acm list-certificates --region $REGION --query "CertificateSummaryList[?DomainName=='*.hashpass.tech' || DomainName=='hashpass.tech'].CertificateArn" --output text 2>/dev/null || echo "")

# If not found, try the specific ARN we created
if [ -z "$CERT_ARN" ]; then
    CERT_ARN="arn:aws:acm:us-east-1:058264267235:certificate/6ab63538-aa75-4df0-9d4f-79d163878d76"
    echo "   Using certificate: $CERT_ARN"
fi

# Verify certificate exists and is valid
CERT_STATUS=$(aws acm describe-certificate --certificate-arn "$CERT_ARN" --region $REGION --query 'Certificate.Status' --output text 2>/dev/null || echo "NOT_FOUND")

if [ "$CERT_STATUS" = "NOT_FOUND" ]; then
    echo "❌ Certificate not found: $CERT_ARN"
    echo ""
    echo "📝 Please create an ACM certificate first"
    exit 1
elif [ "$CERT_STATUS" != "ISSUED" ]; then
    echo "⚠️  Certificate status: $CERT_STATUS"
    echo "   Certificate ARN: $CERT_ARN"
    echo ""
    echo "📝 Certificate must be ISSUED before configuring custom domain"
    echo ""
    echo "   To check status, run:"
    echo "   ./scripts/validate-acm-certificate.sh"
    echo ""
    echo "   Or check in AWS Console → Certificate Manager"
    exit 1
fi

echo "✅ Found certificate: $CERT_ARN"
echo ""

# Delete existing domain if recreating
if [ ! -z "$EXISTING_DOMAIN" ]; then
    echo "🗑️  Deleting existing domain..."
    aws apigatewayv2 delete-domain-name --domain-name $DOMAIN_NAME --region $REGION 2>/dev/null || echo "   (Domain may not exist)"
    echo "   Waiting for deletion to complete..."
    sleep 5
fi

# Create custom domain
echo "📝 Creating custom domain: $DOMAIN_NAME"
DOMAIN_RESPONSE=$(aws apigatewayv2 create-domain-name \
  --domain-name $DOMAIN_NAME \
  --domain-name-configurations CertificateArn=$CERT_ARN \
  --region $REGION)

TARGET_DOMAIN=$(echo "$DOMAIN_RESPONSE" | jq -r '.DomainNameConfigurations[0].TargetDomainName')
echo "✅ Custom domain created"
echo "   Target Domain: $TARGET_DOMAIN"
echo ""

# Check for existing API mapping
EXISTING_MAPPING=$(aws apigatewayv2 get-api-mappings --domain-name $DOMAIN_NAME --region $REGION --query 'Items[?ApiId==`'$API_ID'`]' --output json 2>/dev/null || echo "[]")

if [ "$EXISTING_MAPPING" = "[]" ] || [ -z "$EXISTING_MAPPING" ]; then
    echo "📝 Creating API mapping..."
    aws apigatewayv2 create-api-mapping \
      --domain-name $DOMAIN_NAME \
      --api-id $API_ID \
      --stage $STAGE_NAME \
      --api-mapping-key "" \
      --region $REGION
    
    echo "✅ API mapping created"
else
    echo "✅ API mapping already exists"
fi

echo ""
echo "✅ Custom domain configured successfully!"
echo ""
echo "📝 DNS Configuration Required:"
echo "   Create a CNAME record in Route 53:"
echo "   Name: api"
echo "   Type: CNAME"
echo "   Value: $TARGET_DOMAIN"
echo "   TTL: 300"
echo ""
echo "   Or run: aws route53 change-resource-record-sets \\"
echo "     --hosted-zone-id YOUR_ZONE_ID \\"
echo "     --change-batch file://dns-change.json"
echo ""
echo "📚 After DNS propagation (5-15 minutes), test:"
echo "   curl https://$DOMAIN_NAME/api/config/versions"
echo ""

