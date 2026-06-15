#!/bin/bash
# Script to create IAM role for GitHub Actions OIDC

set -e

ROLE_NAME="GitHubActions-LambdaDeploy"
EXPECTED_ACCOUNT_ID="${EXPECTED_AWS_ACCOUNT_ID:-${AWS_ACCOUNT_ID:-}}"
REGION="us-east-1"
REPO="${1:-${GITHUB_REPOSITORY:-hashpass-tech/hashpass.tech}}"

echo "🔐 Setting up IAM Role for GitHub Actions"
echo "=========================================="
echo ""

# Check if OIDC provider exists
echo "🔍 Checking for OIDC provider..."
OIDC_PROVIDER=$(aws iam list-open-id-connect-providers --query "OpenIDConnectProviderList[?contains(Arn, 'token.actions.githubusercontent.com')].Arn" --output text 2>/dev/null || echo "")

CURRENT_ACCOUNT=$(aws sts get-caller-identity --query Account --output text 2>/dev/null || echo "")
if [ -z "$CURRENT_ACCOUNT" ]; then
    echo "ERROR: unable to determine AWS account. Configure AWS credentials first."
    exit 1
fi

if [ -n "$EXPECTED_ACCOUNT_ID" ] && [ "$CURRENT_ACCOUNT" != "$EXPECTED_ACCOUNT_ID" ]; then
    echo "ERROR: AWS caller identity is $CURRENT_ACCOUNT, expected $EXPECTED_ACCOUNT_ID."
    exit 1
fi

if [ -z "$OIDC_PROVIDER" ]; then
    echo "📝 Creating OIDC provider for GitHub Actions..."
    
    # Create OIDC provider
    aws iam create-open-id-connect-provider \
      --url https://token.actions.githubusercontent.com \
      --client-id-list sts.amazonaws.com \
      --thumbprint-list 6938fd4d98bab03faadb97b34396831e3780aea1 1c58a3a8518e8759bf075b76b750d4f2df7f9357 \
      --region $REGION 2>/dev/null || echo "   (OIDC provider may already exist)"
    
    echo "✅ OIDC provider configured"
else
    echo "✅ OIDC provider already exists: $OIDC_PROVIDER"
fi

echo ""

# Check if role exists
echo "🔍 Checking for IAM role: $ROLE_NAME..."
EXISTING_ROLE=$(aws iam get-role --role-name $ROLE_NAME 2>/dev/null || echo "")

if [ ! -z "$EXISTING_ROLE" ]; then
    echo "⚠️  Role '$ROLE_NAME' already exists"
    echo ""
    read -p "Do you want to recreate it? (y/n) " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Using existing role..."
        ROLE_ARN=$(aws iam get-role --role-name $ROLE_NAME --query 'Role.Arn' --output text)
        echo ""
        echo "✅ Role ARN: $ROLE_ARN"
        echo ""
        echo "📝 Add this to GitHub Secrets:"
        echo "   AWS_ROLE_ARN=$ROLE_ARN"
        exit 0
    fi
    
    echo "🗑️  Deleting existing role..."
    # Detach policies
    aws iam list-attached-role-policies --role-name $ROLE_NAME --query 'AttachedPolicies[*].PolicyArn' --output text | \
      xargs -I {} aws iam detach-role-policy --role-name $ROLE_NAME --policy-arn {} 2>/dev/null || true
    # Delete role
    aws iam delete-role --role-name $ROLE_NAME 2>/dev/null || true
    echo "   Waiting for deletion..."
    sleep 5
fi

# Create trust policy
TRUST_POLICY=$(cat <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::${CURRENT_ACCOUNT}:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
        },
        "StringLike": {
          "token.actions.githubusercontent.com:sub": "repo:${REPO}:*"
        }
      }
    }
  ]
}
EOF
)

echo "📝 Creating IAM role: $ROLE_NAME"
aws iam create-role \
  --role-name $ROLE_NAME \
  --assume-role-policy-document "$TRUST_POLICY" \
  --description "Role for GitHub Actions to deploy Lambda functions" \
  --region $REGION

echo "✅ Role created"

# Attach Lambda full access policy
echo "📝 Attaching Lambda permissions..."
aws iam attach-role-policy \
  --role-name $ROLE_NAME \
  --policy-arn arn:aws:iam::aws:policy/AWSLambda_FullAccess \
  --region $REGION

echo "✅ Permissions attached"

# Get role ARN
ROLE_ARN=$(aws iam get-role --role-name $ROLE_NAME --query 'Role.Arn' --output text)

echo ""
echo "✅ Setup complete!"
echo ""
echo "📝 Next steps:"
echo "   1. Go to GitHub → Settings → Secrets and variables → Actions"
echo "   2. Add new secret:"
echo "      Name: AWS_ROLE_ARN"
echo "      Value: $ROLE_ARN"
echo ""
echo "   3. The workflow will automatically deploy Lambda on pushes to main/develop"
echo ""
