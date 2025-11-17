#!/bin/bash
# Script to wait for ACM certificate validation and then setup custom domain

set -e

CERT_ARN="arn:aws:acm:us-east-1:058264267235:certificate/6ab63538-aa75-4df0-9d4f-79d163878d76"
REGION="us-east-1"
MAX_WAIT=1800  # 30 minutes
CHECK_INTERVAL=30  # Check every 30 seconds
ELAPSED=0

echo "⏳ Waiting for ACM Certificate Validation"
echo "=========================================="
echo ""
echo "Certificate ARN: $CERT_ARN"
echo "Max wait time: $((MAX_WAIT / 60)) minutes"
echo "Checking every $CHECK_INTERVAL seconds"
echo ""

while [ $ELAPSED -lt $MAX_WAIT ]; do
    CERT_STATUS=$(aws acm describe-certificate --certificate-arn "$CERT_ARN" --region $REGION --query 'Certificate.Status' --output text 2>/dev/null || echo "UNKNOWN")
    
    echo "[$(date +%H:%M:%S)] Status: $CERT_STATUS (${ELAPSED}s elapsed)"
    
    if [ "$CERT_STATUS" = "ISSUED" ]; then
        echo ""
        echo "✅ Certificate is validated!"
        echo ""
        echo "🚀 Setting up custom domain..."
        echo ""
        ./scripts/setup-custom-domain.sh
        exit 0
    elif [ "$CERT_STATUS" = "VALIDATION_TIMED_OUT" ] || [ "$CERT_STATUS" = "FAILED" ]; then
        echo ""
        echo "❌ Certificate validation failed or timed out"
        echo "   Status: $CERT_STATUS"
        echo ""
        echo "Please check:"
        echo "   1. DNS records are correctly configured"
        echo "   2. DNS propagation has completed"
        echo "   3. Run: ./scripts/validate-acm-certificate.sh"
        exit 1
    fi
    
    sleep $CHECK_INTERVAL
    ELAPSED=$((ELAPSED + CHECK_INTERVAL))
done

echo ""
echo "⏰ Timeout reached. Certificate is still pending validation."
echo ""
echo "The certificate may still be validating. You can:"
echo "   1. Check status: ./scripts/validate-acm-certificate.sh"
echo "   2. Once ISSUED, run: ./scripts/setup-custom-domain.sh"
echo ""

