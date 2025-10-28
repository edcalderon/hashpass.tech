#!/bin/bash

# BSL2025 HashPass Build and Deploy Script
# This script builds the web app and deploys to Amplify (Lambda-based service)

set -e

echo "🚀 BSL2025 HashPass - Amplify Build and Deploy"
echo "=============================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PROJECT_ROOT="/home/ed/Documents/hash/bsl2025.hashpass.tech"

# Check if running as root for Amplify deployment
check_root() {
    if [[ $EUID -eq 0 ]]; then
        echo -e "${YELLOW}⚠️  Running as root. This is not required for Amplify deployment.${NC}"
    fi
}

# Check prerequisites
check_prerequisites() {
    echo -e "${BLUE}🔍 Checking prerequisites...${NC}"
    
    # Check if we're in the right directory
    if [ ! -f "$PROJECT_ROOT/package.json" ]; then
        echo -e "${RED}❌ Not in the correct project directory.${NC}"
        echo "Expected: $PROJECT_ROOT"
        echo "Current: $(pwd)"
        exit 1
    fi
    
    # Check if Node.js is installed
    if ! command -v node &> /dev/null; then
        echo -e "${RED}❌ Node.js is not installed. Please install Node.js 18+ first.${NC}"
        exit 1
    fi
    
    # Check if npm is installed
    if ! command -v npm &> /dev/null; then
        echo -e "${RED}❌ npm is not installed. Please install npm first.${NC}"
        exit 1
    fi
    
    # Check if Amplify CLI is installed
    if ! command -v amplify &> /dev/null; then
        echo -e "${RED}❌ Amplify CLI is not installed.${NC}"
        echo "Install with: npm install -g @aws-amplify/cli"
        exit 1
    fi
    
    # Check if AWS CLI is installed
    if ! command -v aws &> /dev/null; then
        echo -e "${RED}❌ AWS CLI is not installed.${NC}"
        echo "Install with: pip install awscli"
        exit 1
    fi
    
    echo -e "${GREEN}✅ Prerequisites check passed${NC}"
}

# Install main project dependencies
install_dependencies() {
    echo -e "${BLUE}📦 Installing main project dependencies...${NC}"
    
    cd "$PROJECT_ROOT"
    npm install
    
    echo -e "${GREEN}✅ Main dependencies installed${NC}"
}

# Setup parameters
setup_parameters() {
    echo -e "${BLUE}🔐 Setting up Parameter Store...${NC}"
    
    cd "$PROJECT_ROOT"
    
    # Setup parameters in AWS Parameter Store
    ./scripts/setup-parameters.sh create
    
    echo -e "${GREEN}✅ Parameters setup completed${NC}"
}

# Run tests
run_tests() {
    echo -e "${BLUE}🧪 Running tests...${NC}"
    
    # Test main project
    echo -e "${BLUE}  Testing main project...${NC}"
    cd "$PROJECT_ROOT"
    npm run lint
    
    echo -e "${GREEN}✅ Tests passed${NC}"
}

# Build web application
build_web_app() {
    echo -e "${BLUE}🏗️  Building web application...${NC}"
    
    cd "$PROJECT_ROOT"
    npm run build:web
    
    echo -e "${GREEN}✅ Web application built successfully${NC}"
}

# Deploy Lambda functions
deploy_lambda_functions() {
    echo -e "${BLUE}⚡ Deploying Lambda functions...${NC}"
    
    cd "$PROJECT_ROOT"
    
    # Push Lambda functions to AWS
    amplify push --yes
    
    echo -e "${GREEN}✅ Lambda functions deployed successfully${NC}"
}

# Deploy to Amplify
deploy_amplify() {
    echo -e "${BLUE}🌐 Deploying to Amplify...${NC}"
    
    cd "$PROJECT_ROOT"
    
    # Publish to Amplify (includes both web app and Lambda functions)
    amplify publish --yes
    
    echo -e "${GREEN}✅ Amplify deployment completed${NC}"
}

# Test Lambda function
test_lambda_function() {
    echo -e "${BLUE}🧪 Testing Lambda function...${NC}"
    
    cd "$PROJECT_ROOT"
    
    # Get the function name from Amplify
    local function_name=$(amplify status | grep "agendaMonitor" | awk '{print $2}' || echo "agendaMonitor")
    
    if [ -n "$function_name" ]; then
        echo -e "${BLUE}  Testing function: $function_name${NC}"
        
        # Test the Lambda function
        aws lambda invoke \
            --function-name "$function_name" \
            --payload '{"force": true}' \
            response.json
        
        echo -e "${BLUE}  Lambda response:${NC}"
        cat response.json
        echo ""
        
        # Clean up
        rm -f response.json
        
        echo -e "${GREEN}✅ Lambda function test completed${NC}"
    else
        echo -e "${YELLOW}⚠️  Could not find Lambda function name${NC}"
    fi
}

# Show deployment status
show_status() {
    echo -e "${BLUE}📊 Deployment Status:${NC}"
    echo "====================="
    
    cd "$PROJECT_ROOT"
    
    # Show Amplify status
    echo -e "${BLUE}Amplify Status:${NC}"
    amplify status
    
    echo -e "\n${BLUE}📋 Useful Commands:${NC}"
    echo "=================="
    echo "  Amplify status:  amplify status"
    echo "  Amplify logs:    amplify logs"
    echo "  Lambda logs:     aws logs describe-log-groups --log-group-name-prefix /aws/lambda"
    echo "  Test Lambda:     npm run lambda:test"
    echo "  Open console:    amplify console"
}

# Main deployment function
deploy_all() {
    echo -e "${BLUE}🎯 Starting Amplify deployment...${NC}"
    
    check_prerequisites
    install_dependencies
    setup_parameters
    run_tests
    build_web_app
    deploy_lambda_functions
    deploy_amplify
    test_lambda_function
    show_status
    
    echo -e "\n${GREEN}🎉 Amplify deployment completed successfully!${NC}"
    echo -e "${YELLOW}💡 The agenda monitoring Lambda function is now running on AWS.${NC}"
    echo -e "${YELLOW}💡 The web application is deployed to Amplify hosting.${NC}"
    echo -e "${YELLOW}💡 The Lambda function will run every 5 minutes during event dates.${NC}"
}

# Deploy only Lambda functions
deploy_lambda_only() {
    echo -e "${BLUE}🎯 Deploying Lambda functions only...${NC}"
    
    check_prerequisites
    install_dependencies
    setup_parameters
    run_tests
    deploy_lambda_functions
    test_lambda_function
    show_status
    
    echo -e "\n${GREEN}🎉 Lambda deployment completed successfully!${NC}"
}

# Deploy only the web app
deploy_web_only() {
    echo -e "${BLUE}🎯 Deploying web app only...${NC}"
    
    check_prerequisites
    install_dependencies
    run_tests
    build_web_app
    deploy_amplify
    
    echo -e "\n${GREEN}🎉 Web app deployment completed successfully!${NC}"
}

# Show help
show_help() {
    echo "BSL2025 HashPass Build and Deploy Script"
    echo ""
    echo "Usage: $0 [OPTION]"
    echo ""
    echo "Options:"
    echo "  all         Deploy everything (default)"
    echo "  lambda      Deploy only Lambda functions"
    echo "  web         Deploy only the web application"
    echo "  status      Show deployment status"
    echo "  help        Show this help message"
    echo ""
    echo "Examples:"
    echo "  sudo $0 all"
    echo "  $0 lambda"
    echo "  sudo $0 web"
    echo "  sudo $0 status"
}

# Main script logic
case "${1:-all}" in
    "all")
        check_root
        deploy_all
        ;;
    "lambda")
        deploy_lambda_only
        ;;
    "web")
        deploy_web_only
        ;;
    "status")
        check_root
        show_status
        ;;
    "help"|"-h"|"--help")
        show_help
        ;;
    *)
        echo -e "${RED}❌ Unknown option: $1${NC}"
        show_help
        exit 1
        ;;
esac
