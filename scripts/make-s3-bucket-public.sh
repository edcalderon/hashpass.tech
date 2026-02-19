#!/bin/bash

# Script to configure S3 bucket for public read access to speaker avatars
# Bucket: hashpass-assets
# Region: us-east-2
# Path: speakers/avatars/*

BUCKET_NAME="hashpass-assets"
REGION="us-east-2"
POLICY_PATH="speakers/avatars/*"

echo "=========================================="
echo "S3 Bucket Public Access Configuration"
echo "=========================================="
echo ""
echo "Bucket: $BUCKET_NAME"
echo "Region: $REGION"
echo "Path: $POLICY_PATH"
echo ""
echo "This script will help you configure public access."
echo ""

# Check if AWS CLI is installed
if ! command -v aws &> /dev/null; then
    echo "⚠️  AWS CLI is not installed."
    echo "   Please follow the manual steps in docs/MAKE_S3_BUCKET_PUBLIC.md"
    echo ""
    exit 1
fi

# Check if AWS credentials are configured
if ! aws sts get-caller-identity &> /dev/null; then
    echo "⚠️  AWS credentials not configured."
    echo "   Run: aws configure"
    echo ""
    exit 1
fi

echo "STEP 1: Disable Block Public Access"
echo "-----------------------------------"
echo "Disabling block public access settings..."
aws s3api put-public-access-block \
  --bucket "$BUCKET_NAME" \
  --public-access-block-configuration \
    "BlockPublicAcls=false,IgnorePublicAcls=false,BlockPublicPolicy=false,RestrictPublicBuckets=false" \
  --region "$REGION"

if [ $? -eq 0 ]; then
    echo "✅ Block public access disabled"
else
    echo "❌ Failed to disable block public access"
    echo "   Please do this manually in AWS Console"
    exit 1
fi

echo ""
echo "STEP 2: Add Bucket Policy"
echo "-------------------------"

# Create temporary policy file
POLICY_FILE=$(mktemp)
cat > "$POLICY_FILE" << EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadGetObjectForSpeakerAvatars",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::$BUCKET_NAME/$POLICY_PATH"
    }
  ]
}
EOF

echo "Adding bucket policy..."
aws s3api put-bucket-policy \
  --bucket "$BUCKET_NAME" \
  --policy "file://$POLICY_FILE" \
  --region "$REGION"

if [ $? -eq 0 ]; then
    echo "✅ Bucket policy added"
    rm "$POLICY_FILE"
else
    echo "❌ Failed to add bucket policy"
    echo "   Policy JSON saved to: $POLICY_FILE"
    echo "   Please add it manually in AWS Console"
    exit 1
fi

echo ""
echo "STEP 3: Verify Configuration"
echo "---------------------------"
echo "Testing public access..."
TEST_URL="https://$BUCKET_NAME.s3.$REGION.amazonaws.com/speakers/avatars/foto-claudia-restrepo.png"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$TEST_URL")

if [ "$HTTP_CODE" = "200" ]; then
    echo "✅ Public access is working! (HTTP $HTTP_CODE)"
elif [ "$HTTP_CODE" = "403" ]; then
    echo "⚠️  Still getting 403 Forbidden"
    echo "   This might take a few minutes to propagate"
    echo "   Or check the bucket policy in AWS Console"
elif [ "$HTTP_CODE" = "404" ]; then
    echo "⚠️  Getting 404 Not Found"
    echo "   The image might not exist, but public access is configured"
else
    echo "⚠️  Unexpected response: HTTP $HTTP_CODE"
fi

echo ""
echo "=========================================="
echo "Configuration Complete!"
echo "=========================================="
echo ""
echo "Your S3 bucket should now be publicly accessible."
echo "Test URL: $TEST_URL"
echo ""
echo "If you still see 403 errors, wait a few minutes for"
echo "the changes to propagate, or check AWS Console."

