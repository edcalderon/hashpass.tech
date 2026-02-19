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

# Configuration - now using environment variables
SUPABASE_URL="${EXPO_PUBLIC_SUPABASE_URL}"
SUPABASE_SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY}"

# Validate that environment variables are set
if [ -z "$SUPABASE_URL" ] || [ -z "$SUPABASE_SERVICE_ROLE_KEY" ]; then
    echo -e "${RED}❌ Missing required environment variables${NC}"
    echo "Please ensure .env file exists with:"
    echo "  EXPO_PUBLIC_SUPABASE_URL=your_supabase_url"
    echo "  SUPABASE_SERVICE_ROLE_KEY=your_service_role_key"
    exit 1
fi

# Parameter Store paths
URL_PARAMETER="/hashpass/bsl2025/supabase/url"
KEY_PARAMETER="/hashpass/bsl2025/supabase/service-role-key"

# Check prerequisites
check_prerequisites() {
    echo -e "${BLUE}🔍 Checking prerequisites...${NC}"
    
    # Check if AWS CLI is installed
    if ! command -v aws &> /dev/null; then
        echo -e "${RED}❌ AWS CLI is not installed.${NC}"
        echo "Install with: pip install awscli"
        exit 1
    fi
    
    # Check if AWS credentials are configured
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
    
    # Create Supabase URL parameter
    echo -e "${BLUE}  Creating Supabase URL parameter...${NC}"
    aws ssm put-parameter \
        --name "$URL_PARAMETER" \
        --value "$SUPABASE_URL" \
        --type "String" \
        --description "Supabase project URL for BSL2025 HashPass" \
        --overwrite
    
    # Create Supabase service role key parameter (encrypted)
    echo -e "${BLUE}  Creating Supabase service role key parameter...${NC}"
    aws ssm put-parameter \
        --name "$KEY_PARAMETER" \
        --value "$SUPABASE_SERVICE_ROLE_KEY" \
        --type "SecureString" \
        --description "Supabase service role key for BSL2025 HashPass" \
        --overwrite
    
    echo -e "${GREEN}✅ Parameters created successfully${NC}"
}

# Verify parameters
verify_parameters() {
    echo -e "${BLUE}🔍 Verifying parameters...${NC}"
    
    # Check URL parameter
    local url_value=$(aws ssm get-parameter --name "$URL_PARAMETER" --query 'Parameter.Value' --output text 2>/dev/null || echo "")
    if [ "$url_value" = "$SUPABASE_URL" ]; then
        echo -e "${GREEN}✅ URL parameter verified${NC}"
    else
        echo -e "${RED}❌ URL parameter verification failed${NC}"
        return 1
    fi
    
    # Check key parameter (without showing the value)
    if aws ssm get-parameter --name "$KEY_PARAMETER" --with-decryption --query 'Parameter.Value' --output text &> /dev/null; then
        echo -e "${GREEN}✅ Service role key parameter verified${NC}"
    else
        echo -e "${RED}❌ Service role key parameter verification failed${NC}"
        return 1
    fi
}

# List parameters
list_parameters() {
    echo -e "${BLUE}📋 Current parameters:${NC}"
    echo "====================="
    
    aws ssm describe-parameters \
        --parameter-filters "Key=Name,Option=BeginsWith,Values=/hashpass/bsl2025/" \
        --query 'Parameters[*].[Name,Type,Description]' \
        --output table
}

# Delete parameters
delete_parameters() {
    echo -e "${YELLOW}🗑️  Deleting parameters...${NC}"
    
    # Delete URL parameter
    aws ssm delete-parameter --name "$URL_PARAMETER" 2>/dev/null || true
    echo -e "${GREEN}✅ Deleted URL parameter${NC}"
    
    # Delete key parameter
    aws ssm delete-parameter --name "$KEY_PARAMETER" 2>/dev/null || true
    echo -e "${GREEN}✅ Deleted service role key parameter${NC}"
}

# Test Lambda function access
test_lambda_access() {
    echo -e "${BLUE}🧪 Testing Lambda function access to parameters...${NC}"
    
    # This would require the Lambda function to be deployed first
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
    echo "  create      Create parameters in Parameter Store (default)"
    echo "  verify      Verify parameters exist and are correct"
    echo "  list        List all HashPass parameters"
    echo "  delete      Delete all HashPass parameters"
    echo "  test        Test Lambda function access to parameters"
    echo "  help        Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 create"
    echo "  $0 verify"
    echo "  $0 list"
    echo "  $0 delete"
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
    echo "  - Parameters are scoped to /hashpass/bsl2025/ namespace"
    echo "  - Only Lambda functions with proper IAM roles can access these parameters"
}

# Main script logic
case "${1:-create}" in
    "create")
        check_prerequisites
        create_parameters
        verify_parameters
        list_parameters
        echo -e "\n${GREEN}🎉 Parameter Store setup completed successfully!${NC}"
        echo -e "${YELLOW}💡 You can now deploy the Lambda function with: amplify push${NC}"
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
        echo -e "${RED}❌ Unknown command: $1${NC}"
        show_help
        exit 1
        ;;
esac
