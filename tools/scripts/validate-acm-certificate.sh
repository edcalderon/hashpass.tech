#!/bin/bash
# Script to check ACM certificate validation status and display DNS records

set -e

CERT_ARN="${AWS_CERT_ARN:-}"
REGION="us-east-1"

echo "🔐 ACM Certificate Validation Status"
echo "====================================="
echo ""

if [ -z "$CERT_ARN" ]; then
    CERT_ARN=$(aws acm list-certificates --region "$REGION" --query "CertificateSummaryList[?DomainName=='*.hashpass.tech' || DomainName=='hashpass.tech'].CertificateArn | [0]" --output text 2>/dev/null || echo "")
fi

if [ -z "$CERT_ARN" ] || [ "$CERT_ARN" = "None" ]; then
    echo "ERROR: no ACM certificate ARN available. Set AWS_CERT_ARN or create a certificate."
    exit 1
fi

echo "📋 Certificate ARN: $CERT_ARN"
echo ""

# Get certificate status
CERT_STATUS=$(aws acm describe-certificate --certificate-arn "$CERT_ARN" --region $REGION --query 'Certificate.Status' --output text 2>/dev/null || echo "UNKNOWN")

echo "📊 Status: $CERT_STATUS"
echo ""

if [ "$CERT_STATUS" = "ISSUED" ]; then
    echo "✅ Certificate is validated and ready to use!"
    echo ""
    echo "You can now run: ./scripts/setup-custom-domain.sh"
elif [ "$CERT_STATUS" = "PENDING_VALIDATION" ]; then
    echo "⏳ Certificate is pending validation"
    echo ""
    echo "📝 DNS Validation Records Required:"
    echo ""
    
    # Get validation records
    aws acm describe-certificate --certificate-arn "$CERT_ARN" --region $REGION --query 'Certificate.DomainValidationOptions[*].{Domain:DomainName,Name:ResourceRecord.Name,Type:ResourceRecord.Type,Value:ResourceRecord.Value}' --output json 2>/dev/null | jq -r '.[] | "   Domain: \(.Domain)\n   Name: \(.Name)\n   Type: \(.Type)\n   Value: \(.Value)\n"'
    
    echo ""
    echo "📋 Steps:"
    echo "   1. Go to Route 53 → Hosted Zones → hashpass.tech"
    echo "   2. Create CNAME records with the values above"
    echo "   3. Wait for validation (5-30 minutes)"
    echo "   4. Run this script again to check status"
    echo "   5. Once ISSUED, run: ./scripts/setup-custom-domain.sh"
else
    echo "⚠️  Certificate status: $CERT_STATUS"
    echo "   Please check AWS Console for details"
fi

echo ""
