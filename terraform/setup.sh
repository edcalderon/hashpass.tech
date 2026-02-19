#!/bin/bash

# setup.sh - Prepare Azure credentials and environment for Terraform deployment
# Usage: ./setup.sh

set -e

echo "🔧 HashPass Health Check - Setup Script"
echo "========================================"
echo ""

# Check if Azure CLI is installed
if ! command -v az &> /dev/null; then
    echo "❌ Azure CLI (az) not found. Install it first:"
    echo "   curl -sL https://aka.ms/InstallAzureCLIDeb | sudo bash"
    exit 1
fi

echo "✅ Azure CLI found: $(az --version | head -n 1)"
echo ""

# Check if Terraform is installed
if ! command -v terraform &> /dev/null; then
    echo "❌ Terraform not found. Install it first:"
    echo "   https://www.terraform.io/downloads"
    exit 1
fi

echo "✅ Terraform found: $(terraform --version | head -n 1)"
echo ""

# Check if already logged in
if az account show &> /dev/null; then
    CURRENT_ACCOUNT=$(az account show --query "user.name" -o tsv)
    CURRENT_SUB=$(az account show --query "name" -o tsv)
    echo "✅ Azure CLI already authenticated"
    echo "   Account: $CURRENT_ACCOUNT"
    echo "   Subscription: $CURRENT_SUB"
    echo ""
else
    echo "🔐 Logging into Azure..."
    az login
    echo ""
fi

# Get subscription ID
SUBSCRIPTION_ID=$(az account show --query id -o tsv)
echo "📋 Your subscription ID:"
echo "   $SUBSCRIPTION_ID"
echo ""

# Update terraform.tfvars with subscription ID
TFVARS_FILE="terraform.tfvars"

if [ ! -f "$TFVARS_FILE" ]; then
    echo "❌ File not found: $TFVARS_FILE"
    echo "   Run this script from the terraform directory"
    exit 1
fi

echo "📝 Updating $TFVARS_FILE with subscription ID..."
sed -i.bak "s/azure_subscription_id = \"\"/azure_subscription_id = \"$SUBSCRIPTION_ID\"/" "$TFVARS_FILE"

echo "✅ Updated successfully!"
echo ""

# Verify the update
echo "📋 Current terraform.tfvars (subscription line):"
grep "azure_subscription_id" "$TFVARS_FILE"
echo ""

echo "✅ Setup complete!"
echo ""
echo "Next step: Run the deployment script"
echo "   ./deploy.sh"
echo ""
