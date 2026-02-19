#!/bin/bash

# Script to help configure S3 bucket for public access
# This provides the exact steps and policy JSON

echo "=========================================="
echo "S3 Bucket Public Access Configuration"
echo "=========================================="
echo ""
echo "Bucket: hashpass-email-assets"
echo "Region: us-east-2"
echo ""
echo "STEP 1: Disable Block Public Access"
echo "-----------------------------------"
echo "1. Go to: https://s3.console.aws.amazon.com/s3/buckets/hashpass-email-assets?region=us-east-2&tab=permissions"
echo "2. Click 'Edit' on 'Block public access'"
echo "3. Uncheck these two options:"
echo "   ☐ Block public access to buckets and objects granted through new access control lists (ACLs)"
echo "   ☐ Block public access to buckets and objects granted through any access control lists (ACLs)"
echo "4. Click 'Save changes'"
echo ""
echo "STEP 2: Add Bucket Policy"
echo "-------------------------"
echo "1. In the same Permissions tab, scroll to 'Bucket policy'"
echo "2. Click 'Edit'"
echo "3. Paste this JSON:"
echo ""
cat << 'POLICY'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadGetObject",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::hashpass-email-assets/emails/assets/*"
    }
  ]
}
POLICY
echo ""
echo "4. Click 'Save changes'"
echo ""
echo "STEP 3: Test Access"
echo "------------------"
echo "Run this command to test:"
echo "  curl -I https://hashpass-email-assets.s3.us-east-2.amazonaws.com/emails/assets/images/BSL.svg"
echo ""
echo "Expected response: HTTP/1.1 200 OK"
echo ""
echo "=========================================="

