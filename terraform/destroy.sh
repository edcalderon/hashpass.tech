#!/bin/bash

# destroy.sh - Tear down Azure infrastructure (useful for testing and cleanup)
# Usage: ./destroy.sh

set -e

echo "⚠️  HashPass Health Check - Destroy Script"
echo "=========================================="
echo ""
echo "This will DELETE all Azure resources created by Terraform."
echo "This action cannot be undone!"
echo ""

# Ask for confirmation
read -p "Type 'destroy-hashpass' to confirm: " -r CONFIRM

if [ "$CONFIRM" != "destroy-hashpass" ]; then
    echo "❌ Destruction cancelled"
    exit 1
fi

echo ""
echo "⏳ Destroying infrastructure..."
echo ""

terraform destroy -auto-approve

echo ""
echo "✅ Infrastructure destroyed!"
echo ""
