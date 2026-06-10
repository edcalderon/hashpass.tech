#!/bin/bash
# Script to create IAM Role for Lambda function
# This role allows Lambda to execute and write to CloudWatch Logs

set -e

echo "🔐 Creating IAM Role for Lambda Function"
echo "========================================="
echo ""

ROLE_NAME="hashpass-lambda-execution-role"
POLICY_NAME="hashpass-lambda-execution-policy"

# Check if role already exists
if aws iam get-role --role-name $ROLE_NAME &>/dev/null; then
    echo "✅ IAM Role '$ROLE_NAME' already exists"
    ROLE_ARN=$(aws iam get-role --role-name $ROLE_NAME --query 'Role.Arn' --output text)
    echo "   Role ARN: $ROLE_ARN"
    exit 0
fi

echo "📝 Creating IAM Role: $ROLE_NAME"
echo ""

# Create trust policy (allows Lambda service to assume this role)
TRUST_POLICY=$(cat <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "lambda.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
EOF
)

# Create the role
echo "1. Creating role..."
aws iam create-role \
  --role-name $ROLE_NAME \
  --assume-role-policy-document "$TRUST_POLICY" \
  --description "Execution role for HashPass API Lambda function"

# Attach basic execution policy (for CloudWatch Logs)
echo "2. Attaching AWS managed policy: AWSLambdaBasicExecutionRole..."
aws iam attach-role-policy \
  --role-name $ROLE_NAME \
  --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole

# Get role ARN
ROLE_ARN=$(aws iam get-role --role-name $ROLE_NAME --query 'Role.Arn' --output text)

echo ""
echo "✅ IAM Role created successfully!"
echo "   Role Name: $ROLE_NAME"
echo "   Role ARN: $ROLE_ARN"
echo ""
echo "📝 Next step: Create Lambda function using this role ARN"
echo ""

