#!/bin/bash
# Script to update DNS for api.hashpass.tech to point to API Gateway

set -e

DOMAIN_NAME="api.hashpass.tech"
REGION="us-east-1"
HOSTED_ZONE_ID="Z0236404TWGQH7K9IU6F"

echo "🌐 Updating DNS for api.hashpass.tech"
echo "======================================"
echo ""

# Check if custom domain exists in API Gateway
echo "🔍 Checking API Gateway custom domain..."
DOMAIN_INFO=$(aws apigatewayv2 get-domain-name --domain-name $DOMAIN_NAME --region $REGION 2>/dev/null || echo "")

if [ -z "$DOMAIN_INFO" ]; then
    echo "❌ Custom domain '$DOMAIN_NAME' not found in API Gateway"
    echo ""
    echo "Please run: ./scripts/setup-custom-domain.sh first"
    exit 1
fi

# Get target domain from API Gateway
# For REGIONAL endpoints, use ApiGatewayDomainName
# For EDGE endpoints, use TargetDomainName (CloudFront)
TARGET_DOMAIN=$(echo "$DOMAIN_INFO" | jq -r '.DomainNameConfigurations[0].TargetDomainName // .DomainNameConfigurations[0].ApiGatewayDomainName' 2>/dev/null || echo "")

if [ -z "$TARGET_DOMAIN" ] || [ "$TARGET_DOMAIN" = "null" ]; then
    # Fallback: try ApiGatewayDomainName directly
    TARGET_DOMAIN=$(echo "$DOMAIN_INFO" | jq -r '.DomainNameConfigurations[0].ApiGatewayDomainName' 2>/dev/null || echo "")
fi

if [ -z "$TARGET_DOMAIN" ] || [ "$TARGET_DOMAIN" = "null" ]; then
    echo "❌ Could not get target domain from API Gateway"
    echo "   Domain info:"
    echo "$DOMAIN_INFO" | jq '.'
    exit 1
fi

echo "✅ Found API Gateway domain: $TARGET_DOMAIN"
echo ""

# Check current DNS record
echo "🔍 Checking current DNS record..."
CURRENT_RECORD=$(aws route53 list-resource-record-sets --hosted-zone-id "$HOSTED_ZONE_ID" --query "ResourceRecordSets[?Name=='$DOMAIN_NAME.']" --output json 2>/dev/null | jq '.[0]' || echo "null")

if [ "$CURRENT_RECORD" != "null" ] && [ ! -z "$CURRENT_RECORD" ]; then
    CURRENT_VALUE=$(echo "$CURRENT_RECORD" | jq -r '.ResourceRecords[0].Value' 2>/dev/null || echo "")
    echo "   Current value: $CURRENT_VALUE"
    
    if [ "$CURRENT_VALUE" = "$TARGET_DOMAIN" ]; then
        echo "✅ DNS already points to API Gateway!"
        exit 0
    fi
fi

# Create change batch
echo "📝 Updating DNS record..."
CHANGE_BATCH="{
  \"Changes\": [{
    \"Action\": \"UPSERT\",
    \"ResourceRecordSet\": {
      \"Name\": \"$DOMAIN_NAME\",
      \"Type\": \"CNAME\",
      \"TTL\": 300,
      \"ResourceRecords\": [{
        \"Value\": \"$TARGET_DOMAIN\"
      }]
    }
  }]
}"

CHANGE_ID=$(aws route53 change-resource-record-sets \
  --hosted-zone-id "$HOSTED_ZONE_ID" \
  --change-batch "$CHANGE_BATCH" \
  --query 'ChangeInfo.Id' \
  --output text 2>/dev/null | sed 's|/change/||')

if [ ! -z "$CHANGE_ID" ] && [ "$CHANGE_ID" != "None" ]; then
    echo "✅ DNS record updated successfully!"
    echo "   Change ID: $CHANGE_ID"
    echo ""
    echo "⏳ DNS propagation may take 5-15 minutes"
    echo ""
    echo "📋 To verify:"
    echo "   dig $DOMAIN_NAME"
    echo "   curl https://$DOMAIN_NAME/api/config/versions"
else
    echo "❌ Failed to update DNS record"
    exit 1
fi

