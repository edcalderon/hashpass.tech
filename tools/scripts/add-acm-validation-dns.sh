#!/bin/bash
# Script to automatically add ACM certificate validation DNS records to Route 53

set -e

CERT_ARN="arn:aws:acm:us-east-1:058264267235:certificate/6ab63538-aa75-4df0-9d4f-79d163878d76"
REGION="us-east-1"
HOSTED_ZONE_NAME="hashpass.tech"

echo "🔐 Adding ACM Certificate Validation DNS Records"
echo "=================================================="
echo ""

# Get hosted zone ID
echo "🔍 Finding Route 53 hosted zone for $HOSTED_ZONE_NAME..."
HOSTED_ZONE_ID=$(aws route53 list-hosted-zones-by-name --dns-name "$HOSTED_ZONE_NAME" --query 'HostedZones[0].Id' --output text 2>/dev/null | sed 's|/hostedzone/||' || echo "")

if [ -z "$HOSTED_ZONE_ID" ] || [ "$HOSTED_ZONE_ID" = "None" ]; then
    echo "❌ Hosted zone '$HOSTED_ZONE_NAME' not found in Route 53"
    echo ""
    echo "Please create the hosted zone first or provide the correct zone name"
    exit 1
fi

echo "✅ Found hosted zone: $HOSTED_ZONE_ID"
echo ""

# Get validation records from ACM
echo "📋 Getting validation records from ACM..."
VALIDATION_RECORDS=$(aws acm describe-certificate --certificate-arn "$CERT_ARN" --region $REGION --query 'Certificate.DomainValidationOptions[*].{Domain:DomainName,Name:ResourceRecord.Name,Type:ResourceRecord.Type,Value:ResourceRecord.Value}' --output json 2>/dev/null)

if [ -z "$VALIDATION_RECORDS" ] || [ "$VALIDATION_RECORDS" = "[]" ]; then
    echo "❌ No validation records found for certificate"
    exit 1
fi

echo "✅ Found validation records"
echo ""

# Check if records already exist
echo "🔍 Checking if validation records already exist..."
for record in $(echo "$VALIDATION_RECORDS" | jq -r '.[].Name'); do
    RECORD_NAME=$(echo "$record" | sed 's/\.$//')
    EXISTING=$(aws route53 list-resource-record-sets --hosted-zone-id "$HOSTED_ZONE_ID" --query "ResourceRecordSets[?Name=='$record']" --output json 2>/dev/null | jq 'length')
    
    if [ "$EXISTING" != "0" ] && [ "$EXISTING" != "null" ]; then
        echo "   ⚠️  Record already exists: $RECORD_NAME"
    else
        echo "   ✅ Will create: $RECORD_NAME"
    fi
done

echo ""
read -p "Do you want to create/update these DNS records? (y/n) " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Aborted"
    exit 1
fi

# Create change batch
echo "📝 Creating DNS records..."
CHANGE_BATCH=$(echo "$VALIDATION_RECORDS" | jq -r '{
  Changes: [.[] | {
    Action: "UPSERT",
    ResourceRecordSet: {
      Name: .Name,
      Type: .Type,
      TTL: 300,
      ResourceRecords: [{
        Value: .Value
      }]
    }
  }]
}')

# Apply changes
CHANGE_ID=$(aws route53 change-resource-record-sets \
  --hosted-zone-id "$HOSTED_ZONE_ID" \
  --change-batch "$CHANGE_BATCH" \
  --query 'ChangeInfo.Id' \
  --output text 2>/dev/null | sed 's|/change/||')

if [ ! -z "$CHANGE_ID" ] && [ "$CHANGE_ID" != "None" ]; then
    echo "✅ DNS records created/updated successfully!"
    echo "   Change ID: $CHANGE_ID"
    echo ""
    echo "⏳ Waiting for DNS propagation and certificate validation..."
    echo "   This may take 5-30 minutes"
    echo ""
    echo "📋 To check validation status, run:"
    echo "   ./scripts/validate-acm-certificate.sh"
    echo ""
    echo "📋 Once validated (status: ISSUED), run:"
    echo "   ./scripts/setup-custom-domain.sh"
else
    echo "❌ Failed to create DNS records"
    exit 1
fi

