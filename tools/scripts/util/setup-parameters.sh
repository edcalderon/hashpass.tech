#!/bin/bash

# Setup AWS Parameter Store for HashPass BSL2025
# This script securely stores Supabase credentials in AWS Parameter Store

set -e

echo "🔐 HashPass BSL2025 - Parameter Store Setup"
echo "=========================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Load environment variables
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
fi

# 2. Define Mapping/Suffixes (Matches propagate-env/sync-env)
case "$ENV_NAME" in
    "production") SUFFIX="_PROD" ;;
    "staging") SUFFIX="_STAGING" ;;
    "local") SUFFIX="_DEV" ;;
    *) SUFFIX="_DEV" ;;
esac

# Function to get value with override logic
get_config_value() {
    local key=$1
    local override_key="${key}${SUFFIX}"
    
    # If override exists, return it, otherwise return base key value
    if [ ! -z "${!override_key}" ]; then
        echo "${!override_key}"
    else
        echo "${!key}"
    fi
}

# Check prerequisites
check_prerequisites() {
    echo -e "${BLUE}🔍 Checking prerequisites...${NC}"
    
    if ! command -v aws &> /dev/null; then
        echo -e "${RED}❌ AWS CLI is not installed.${NC}"
        echo "Install with: pip install awscli"
        exit 1
    fi
    
    if ! aws sts get-caller-identity &> /dev/null; then
        echo -e "${RED}❌ AWS credentials not configured.${NC}"
        echo "Run: aws configure"
        exit 1
    fi
    
    echo -e "${GREEN}✅ Prerequisites check passed${NC}"
}

# Create parameters
create_parameters() {
    echo -e "${BLUE}🔐 Creating parameters in AWS Parameter Store...${NC}"
    
    for param in "${PARAMETERS[@]}"; do
        IFS='|' read -r env_var ssm_path type desc <<< "$param"
        
        # Get value from environment
        value=$(get_config_value "$env_var")
        
        if [ -z "$value" ]; then
            echo -e "${YELLOW}⚠️ Skipping $env_var - not found in environment${NC}"
            continue
        fi
        
        echo -e "${BLUE}  Creating parameter: ${ssm_path} ...${NC}"
        aws ssm put-parameter \
            --region us-east-1 \
            --name "$ssm_path" \
            --value "$value" \
            --type "$type" \
            --description "$desc" \
            --overwrite > /dev/null
    done
    
    echo -e "${GREEN}✅ Parameters created successfully${NC}"
}

# Verify parameters
verify_parameters() {
    echo -e "${BLUE}🔍 Verifying parameters...${NC}"
    local all_passed=true
    
    for param in "${PARAMETERS[@]}"; do
        IFS='|' read -r env_var ssm_path type desc <<< "$param"
        
        value=$(get_config_value "$env_var")
        if [ -z "$value" ]; then
            continue
        fi
        
        # Check parameter
        local cmd="aws ssm get-parameter --region us-east-1 --name \"$ssm_path\""
        if [ "$type" == "SecureString" ]; then
            cmd="$cmd --with-decryption"
        fi
        
        local ssm_value=$(eval "$cmd --query 'Parameter.Value' --output text 2>/dev/null" || echo "")
        
        if [ "$ssm_value" = "$value" ]; then
            echo -e "${GREEN}✅ Verified: $ssm_path${NC}"
        else
            echo -e "${RED}❌ Verification failed for: $ssm_path${NC}"
            all_passed=false
        fi
    done
    
    if [ "$all_passed" = true ]; then
        return 0
    else
        return 1
    fi
}

# List parameters
list_parameters() {
    echo -e "${BLUE}📋 Current parameters:${NC}"
    echo "====================="
    
    aws ssm describe-parameters \
        --region us-east-1 \
        --parameter-filters "Key=Name,Option=BeginsWith,Values=/hashpass/$ENV_NAME/" \
        --query 'Parameters[*].[Name,Type,Description]' \
        --output table
}

# Delete parameters
delete_parameters() {
    echo -e "${YELLOW}🗑️  Deleting parameters for $ENV_NAME...${NC}"
    
    for param in "${PARAMETERS[@]}"; do
        IFS='|' read -r env_var ssm_path type desc <<< "$param"
        aws ssm delete-parameter --region us-east-1 --name "$ssm_path" 2>/dev/null || true
        echo -e "${GREEN}✅ Deleted parameter: $ssm_path${NC}"
    done
}

# Clean stale parameters (surgical delete)
clean_stale_parameters() {
    echo -e "${BLUE}🧹 Cleaning stale parameters in namespace: /hashpass/$ENV_NAME/ ...${NC}"
    
    # Get all parameters in this namespace
    local existing_params=$(aws ssm describe-parameters \
        --region us-east-1 \
        --parameter-filters "Key=Name,Option=BeginsWith,Values=/hashpass/$ENV_NAME/" \
        --query 'Parameters[*].Name' --output text)
    
    for existing in $existing_params; do
        local found=false
        for param in "${PARAMETERS[@]}"; do
            IFS='|' read -r env_var ssm_path type desc <<< "$param"
            if [ "$existing" == "$ssm_path" ]; then
                found=true
                break
            fi
        done
        
        if [ "$found" = false ]; then
            echo -e "${YELLOW}🗑️  Removing stale parameter: $existing ...${NC}"
            aws ssm delete-parameter --region us-east-1 --name "$existing" 2>/dev/null || true
        fi
    done
    
    echo -e "${GREEN}✅ Clean completed${NC}"
}

# Test Lambda function access
test_lambda_access() {
    echo -e "${BLUE}🧪 Testing Lambda function access to parameters...${NC}"
    echo -e "${YELLOW}⚠️  Lambda function must be deployed first to test parameter access${NC}"
    echo "Run: amplify push"
    echo "Then: npm run lambda:test"
}

# Show help
show_help() {
    echo "HashPass BSL2025 Parameter Store Setup"
    echo ""
    echo "Usage: $0 [COMMAND]"
    echo ""
    echo "Commands:"
    echo "  create      Create/Update parameters in Parameter Store (default)"
    echo "  sync        Surgically sync parameters (create/update + delete stale)"
    echo "  verify      Verify parameters exist and are correct"
    echo "  list        List all HashPass parameters"
    echo "  delete      Delete all HashPass parameters in current env"
    echo "  clean       Only delete stale parameters (not in list)"
    echo "  test        Test Lambda function access to parameters"
    echo "  help        Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 create dev"
    echo "  $0 sync dev"
    echo "  $0 sync production"
    echo "  $0 delete dev"
    echo ""
    echo "Environment Variables:"
    echo "  EXPO_PUBLIC_SUPABASE_URL    Supabase project URL"
    echo "  SUPABASE_SERVICE_ROLE_KEY   Supabase service role key"
    echo ""
    echo "You can set these via:"
    echo "  - .env file in project root"
    echo "  - export commands in your shell"
    echo "  - Environment variables in your deployment system"
    echo ""
    echo "Security Notes:"
    echo "  - Service role key is stored as SecureString (encrypted)"
    echo "  - Parameters are scoped to /hashpass/\$ENV/ namespace"
    echo "  - Only Lambda functions with proper IAM roles can access these parameters"
}

# Main script logic
COMMAND="${1:-create}"
ENV_NAME="${2:-staging}"

# Profile mapping repeated for correct lookup in sub-commands if needed
case "$ENV_NAME" in
    "production") SUFFIX="_PROD" ;;
    "dev") SUFFIX="_DEV" ;;
    "local") 
        echo -e "${RED}❌ Targeting [local] environment on AWS is not allowed.${NC}"
        echo "Local environment should only exist on your machine."
        exit 1
        ;;
    *) SUFFIX="_DEV" ;;
esac

echo "🔍 Targeting AWS environment: $ENV_NAME"

# Configuration - now using environment variables
# Define parameters: ENV_VAR_NAME|SSM_PATH|TYPE|DESCRIPTION
# Path pattern: /hashpass/${ENV_NAME}/${PATH}
PARAMETERS=(
    "EXPO_PUBLIC_SUPABASE_URL|/hashpass/$ENV_NAME/supabase/url|String|Supabase project URL"
    "EXPO_PUBLIC_SUPABASE_KEY|/hashpass/$ENV_NAME/supabase/anon-key|String|Supabase anon key"
    "SUPABASE_SERVICE_ROLE_KEY|/hashpass/$ENV_NAME/supabase/service-role-key|SecureString|Supabase service role key"
    "DIRECTUS_URL|/hashpass/$ENV_NAME/directus/url|String|Directus URL"
    "EXPO_PUBLIC_DIRECTUS_URL|/hashpass/$ENV_NAME/directus/public-url|String|Directus Public URL"
    "ADMIN_EMAIL|/hashpass/$ENV_NAME/admin/email|String|Directus Admin Email"
    "ADMIN_PASSWORD|/hashpass/$ENV_NAME/admin/password|SecureString|Directus Admin Password"
    "GOOGLE_CLIENT_ID|/hashpass/$ENV_NAME/google/client-id|String|Google OAuth Client ID"
    "GOOGLE_CLIENT_SECRET|/hashpass/$ENV_NAME/google/client-secret|SecureString|Google OAuth Client Secret"
)

case "$COMMAND" in
    "create")
        check_prerequisites
        create_parameters
        verify_parameters
        list_parameters
        echo -e "\n${GREEN}🎉 Parameter Store setup completed successfully!${NC}"
        echo -e "${YELLOW}💡 You can now deploy the Lambda function with: amplify push${NC}"
        ;;
    "sync")
        check_prerequisites
        clean_stale_parameters
        create_parameters
        verify_parameters
        list_parameters
        echo -e "\n${GREEN}🎉 Parameter Store sync completed successfully!${NC}"
        ;;
    "clean")
        check_prerequisites
        clean_stale_parameters
        ;;
    "verify")
        check_prerequisites
        verify_parameters
        echo -e "\n${GREEN}✅ Parameter verification completed${NC}"
        ;;
    "list")
        check_prerequisites
        list_parameters
        ;;
    "delete")
        check_prerequisites
        delete_parameters
        echo -e "\n${GREEN}✅ Parameters deleted successfully${NC}"
        ;;
    "test")
        check_prerequisites
        test_lambda_access
        ;;
    "help"|"-h"|"--help")
        show_help
        ;;
    *)
        echo -e "${RED}❌ Unknown command: $COMMAND${NC}"
        show_help
        exit 1
        ;;
esac
