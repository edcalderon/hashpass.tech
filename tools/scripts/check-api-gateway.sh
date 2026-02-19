#!/bin/bash
# Comprehensive API Gateway and Lambda verification script
# Checks all common AWS regions for API Gateway and Lambda configuration

set -e

echo "🔍 Comprehensive API Gateway & Lambda Verification"
echo "=================================================="
echo ""

# Check AWS CLI
if ! command -v aws &> /dev/null; then
    echo "❌ AWS CLI is not installed. Please install it first."
    exit 1
fi

# Check AWS credentials
if ! aws sts get-caller-identity &> /dev/null; then
    echo "❌ AWS credentials not configured. Please run 'aws configure' first."
    exit 1
fi

echo "✅ AWS CLI configured"
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
echo "   Account ID: $ACCOUNT_ID"
echo ""

# Common AWS regions to check
REGIONS=("us-east-1" "us-east-2" "us-west-1" "us-west-2" "eu-west-1" "eu-central-1" "ap-southeast-1" "sa-east-1")

echo "📋 Checking API Gateways in all regions..."
echo ""

FOUND_APIS=false
for region in "${REGIONS[@]}"; do
    echo "🔍 Checking region: $region"
    
    # Check REST APIs
    REST_APIS=$(aws apigateway get-rest-apis --region $region --query 'items[*].[id,name,createdDate]' --output json 2>/dev/null || echo "[]")
    
    if [ "$REST_APIS" != "[]" ] && [ "$REST_APIS" != "" ]; then
        FOUND_APIS=true
        echo "   ✅ Found REST APIs:"
        echo "$REST_APIS" | jq -r '.[] | "      - ID: \(.[0]) | Name: \(.[1]) | Created: \(.[2])"' 2>/dev/null || echo "$REST_APIS"
        
        # Get API details
        API_IDS=$(echo "$REST_APIS" | jq -r '.[] | .[0]' 2>/dev/null || echo "")
        for api_id in $API_IDS; do
            if [ ! -z "$api_id" ]; then
                echo "      📝 API Details for $api_id:"
                # Get resources
                RESOURCES=$(aws apigateway get-resources --rest-api-id $api_id --region $region --query 'items[*].[path,resourceMethods]' --output json 2>/dev/null || echo "[]")
                if [ "$RESOURCES" != "[]" ]; then
                    echo "$RESOURCES" | jq -r '.[] | "         Path: \(.[0]) | Methods: \(.[1] | keys | join(", "))"' 2>/dev/null || echo "         (Could not parse resources)"
                fi
            fi
        done
    fi
    
    # Check HTTP APIs (API Gateway v2)
    HTTP_APIS=$(aws apigatewayv2 get-apis --region $region --query 'Items[*].[ApiId,Name,CreatedDate]' --output json 2>/dev/null || echo "[]")
    
    if [ "$HTTP_APIS" != "[]" ] && [ "$HTTP_APIS" != "" ]; then
        FOUND_APIS=true
        echo "   ✅ Found HTTP APIs (v2):"
        echo "$HTTP_APIS" | jq -r '.[] | "      - ID: \(.[0]) | Name: \(.[1]) | Created: \(.[2])"' 2>/dev/null || echo "$HTTP_APIS"
    fi
    
    # Check Custom Domains
    CUSTOM_DOMAINS=$(aws apigatewayv2 get-domain-names --region $region --query 'Items[*].[DomainName,DomainNameStatus]' --output json 2>/dev/null || echo "[]")
    
    if [ "$CUSTOM_DOMAINS" != "[]" ] && [ "$CUSTOM_DOMAINS" != "" ]; then
        echo "   ✅ Found Custom Domains:"
        echo "$CUSTOM_DOMAINS" | jq -r '.[] | "      - Domain: \(.[0]) | Status: \(.[1])"' 2>/dev/null || echo "$CUSTOM_DOMAINS"
        
        # Check for api.hashpass.tech specifically
        if echo "$CUSTOM_DOMAINS" | grep -q "api.hashpass.tech" 2>/dev/null; then
            echo "      🎯 Found api.hashpass.tech domain!"
            DOMAIN_DETAILS=$(aws apigatewayv2 get-domain-name --domain-name api.hashpass.tech --region $region --output json 2>/dev/null || echo "{}")
            if [ "$DOMAIN_DETAILS" != "{}" ]; then
                API_GATEWAY_DOMAIN=$(echo "$DOMAIN_DETAILS" | jq -r '.DomainNameConfigurations[0].TargetDomainName' 2>/dev/null || echo "N/A")
                echo "         Target Domain: $API_GATEWAY_DOMAIN"
                echo "         Region: $region"
            fi
        fi
    fi
    
    echo ""
done

if [ "$FOUND_APIS" = false ]; then
    echo "⚠️  No API Gateways found in any checked region"
    echo ""
fi

echo "📋 Checking Lambda Functions..."
echo ""

FOUND_LAMBDAS=false
for region in "${REGIONS[@]}"; do
    LAMBDAS=$(aws lambda list-functions --region $region --query 'Functions[?contains(FunctionName, `bsl`) || contains(FunctionName, `api`) || contains(FunctionName, `hashpass`)].{Name:FunctionName,Runtime:Runtime,LastModified:LastModified}' --output json 2>/dev/null || echo "[]")
    
    if [ "$LAMBDAS" != "[]" ] && [ "$LAMBDAS" != "" ]; then
        FOUND_LAMBDAS=true
        echo "🔍 Region: $region"
        echo "$LAMBDAS" | jq -r '.[] | "   ✅ \(.Name) | Runtime: \(.Runtime) | Modified: \(.LastModified)"' 2>/dev/null || echo "$LAMBDAS"
        echo ""
    fi
done

if [ "$FOUND_LAMBDAS" = false ]; then
    echo "⚠️  No relevant Lambda functions found (bsl, api, or hashpass in name)"
    echo ""
fi

echo "🌐 DNS Configuration for api.hashpass.tech:"
echo ""
DNS_RESULT=$(dig +short api.hashpass.tech 2>/dev/null || echo "")
if [ ! -z "$DNS_RESULT" ]; then
    echo "   IP Addresses:"
    echo "$DNS_RESULT" | while read ip; do
        echo "      - $ip"
        # Try to identify what service this IP belongs to
        WHOIS=$(whois $ip 2>/dev/null | grep -i "org\|netname\|descr" | head -2 || echo "")
        if [ ! -z "$WHOIS" ]; then
            echo "        $(echo "$WHOIS" | head -1)"
        fi
    done
    echo ""
    echo "   ⚠️  These IPs appear to be CloudFront (Amplify Hosting), not API Gateway"
    echo "   API Gateway domains typically look like: d-xxxxx.execute-api.REGION.amazonaws.com"
else
    echo "   ❌ DNS not resolving"
fi

echo ""
echo "📝 Summary & Recommendations:"
echo "=============================="
echo ""
echo "1. If API Gateway exists:"
echo "   - Get the API Gateway domain name from Custom Domains"
echo "   - Update DNS CNAME record to point to that domain"
echo ""
echo "2. If API Gateway does NOT exist:"
echo "   - Follow docs/API-GATEWAY-TROUBLESHOOTING.md to set it up"
echo "   - Or use Cloudflare Pages: npm run deploy:cloudflare"
echo ""
echo "3. Current Issue:"
echo "   - api.hashpass.tech → CloudFront/Amplify Hosting (wrong)"
echo "   - Should be → API Gateway domain (if configured)"
echo ""

