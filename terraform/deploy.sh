#!/bin/bash

# deploy.sh - Deploy health check infrastructure to Azure using Terraform
# Usage: ./deploy.sh

set -e

echo "🚀 HashPass Health Check - Deployment Script"
echo "==========================================="
echo ""

# Check prerequisites
if ! command -v terraform &> /dev/null; then
    echo "❌ Terraform not found. Install it first:"
    echo "   https://www.terraform.io/downloads"
    exit 1
fi

if ! command -v az &> /dev/null; then
    echo "❌ Azure CLI (az) not found. Install it first:"
    echo "   curl -sL https://aka.ms/InstallAzureCLIDeb | sudo bash"
    exit 1
fi

echo "📂 Working directory: $(pwd)"
echo ""

# Step 1: Initialize Terraform
echo "📦 Step 1: Initializing Terraform..."
terraform init
echo "✅ Terraform initialized"
echo ""

# Step 2: Validate configuration
echo "🔍 Step 2: Validating Terraform configuration..."
terraform validate
echo "✅ Configuration is valid"
echo ""

# Step 3: Format check (optional but good practice)
echo "🎨 Step 3: Checking code formatting..."
terraform fmt -check -recursive || {
    echo "⚠️  Formatting issues detected. Auto-fixing..."
    terraform fmt -recursive
}
echo "✅ Formatting OK"
echo ""

# Step 4: Plan deployment
echo "📋 Step 4: Planning deployment..."
terraform plan -out=tfplan

echo ""
echo "📊 Deployment Plan Summary:"
terraform show -json tfplan | jq '.resource_changes[] | {type: .type, actions: .change.actions}' 2>/dev/null || echo "   (Plan created, ready to apply)"
echo ""

# Step 5: Ask for confirmation
read -p "Do you want to apply this plan? (yes/no): " -r CONFIRM
echo ""

if [[ ! $CONFIRM =~ ^[Yy][Ee][Ss]$ ]]; then
    echo "❌ Deployment cancelled"
    rm -f tfplan
    exit 1
fi

# Step 6: Apply deployment
echo "⏳ Step 6: Deploying to Azure (this may take 2-3 minutes)..."
terraform apply tfplan

echo "✅ Deployment completed!"
echo ""

# Step 7: Output results
echo "📋 Deployment Outputs:"
echo "====================="
terraform output -json | jq 'to_entries[] | "\(.key): \(.value.value)"' -r
echo ""

# Save outputs to file
echo "💾 Saving outputs to outputs.txt..."
terraform output -json > outputs.json
terraform output app_service_fqdn > outputs.txt

echo ""
echo "✅ All done!"
echo ""
echo "Your health check API is now live at:"
terraform output app_service_fqdn
echo ""
echo "📊 View Application Insights diagnostics:"
echo "   https://portal.azure.com → Search 'Application Insights' → Select 'hashpass-health-insights'"
echo ""
echo "💰 Monitor costs:"
echo "   https://portal.azure.com → Cost Management + Billing"
echo ""

# Cleanup plan file
rm -f tfplan

echo "✨ Setup complete!"
