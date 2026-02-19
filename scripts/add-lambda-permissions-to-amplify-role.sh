#!/bin/bash
# Script to add Lambda permissions to Amplify service role

set -e

echo "🔐 Adding Lambda Permissions to Amplify Service Role"
echo "===================================================="
echo ""

# Try to detect Amplify app and get service role
echo "🔍 Detecting Amplify service role..."

# Common service role names
POSSIBLE_ROLES=(
  "amplify-hashpasstech-dev-96465-authRole"
  "amplify-hashpass-tech-authRole"
  "AmplifySSRLoggingRole-*"
)

SERVICE_ROLE=""

# Try to find the role
for ROLE_PATTERN in "${POSSIBLE_ROLES[@]}"; do
  if [[ "$ROLE_PATTERN" == *"*"* ]]; then
    # Pattern match
    ROLE=$(aws iam list-roles --query "Roles[?contains(RoleName, '${ROLE_PATTERN//\*/}')].RoleName" --output text 2>/dev/null | head -1)
  else
    ROLE=$(aws iam get-role --role-name "$ROLE_PATTERN" --query 'Role.RoleName' --output text 2>/dev/null || echo "")
  fi
  
  if [ ! -z "$ROLE" ] && [ "$ROLE" != "None" ]; then
    SERVICE_ROLE="$ROLE"
    echo "✅ Found service role: $SERVICE_ROLE"
    break
  fi
done

if [ -z "$SERVICE_ROLE" ]; then
  echo "⚠️  Could not auto-detect service role"
  echo ""
  echo "Please provide the Amplify service role name:"
  read -p "Service role name: " SERVICE_ROLE
fi

if [ -z "$SERVICE_ROLE" ]; then
  echo "❌ Service role name is required"
  exit 1
fi

echo ""
echo "📋 Service Role: $SERVICE_ROLE"
echo ""

# Check if role exists
if ! aws iam get-role --role-name "$SERVICE_ROLE" &>/dev/null; then
  echo "❌ Role '$SERVICE_ROLE' not found"
  echo ""
  echo "Please verify the role name in Amplify Console:"
  echo "   App settings → General → Service role"
  exit 1
fi

# Check current policies
echo "🔍 Checking current policies..."
CURRENT_POLICIES=$(aws iam list-attached-role-policies --role-name "$SERVICE_ROLE" --query 'AttachedPolicies[*].PolicyArn' --output text 2>/dev/null || echo "")

HAS_LAMBDA_ACCESS=false
if echo "$CURRENT_POLICIES" | grep -q "AWSLambda_FullAccess\|AWSLambda"; then
  HAS_LAMBDA_ACCESS=true
  echo "✅ Lambda permissions already attached"
else
  echo "⚠️  Lambda permissions not found"
fi

if [ "$HAS_LAMBDA_ACCESS" = false ]; then
  echo ""
  echo "📝 Attaching Lambda permissions..."
  
  # Attach AWS managed policy
  aws iam attach-role-policy \
    --role-name "$SERVICE_ROLE" \
    --policy-arn arn:aws:iam::aws:policy/AWSLambda_FullAccess
  
  echo "✅ Lambda permissions attached"
else
  echo ""
  echo "✅ No changes needed - Lambda permissions already exist"
fi

echo ""
echo "📋 Current policies attached to role:"
aws iam list-attached-role-policies \
  --role-name "$SERVICE_ROLE" \
  --query 'AttachedPolicies[*].PolicyName' \
  --output table

echo ""
echo "✅ Setup complete!"
echo ""
echo "📝 Next steps:"
echo "   1. Verify in Amplify Console that service role is configured"
echo "   2. Make a test push to trigger a build"
echo "   3. Check build logs to verify Lambda deployment works"
echo ""

