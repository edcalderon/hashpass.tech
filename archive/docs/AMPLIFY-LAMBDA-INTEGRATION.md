# Amplify + Lambda Integration Guide

## Overview

Now that we're using **API Gateway + Lambda** directly (not through Amplify Functions), we need to:

1. **Update DNS**: Point `api.hashpass.tech` to API Gateway (not Amplify Hosting)
2. **Keep Amplify**: For static frontend hosting only
3. **Integrate Lambda with CD**: Automate Lambda deployment on Amplify builds

## Current Architecture

```
Frontend (Static) → Amplify Hosting → hashpass.tech, bsl2025.hashpass.tech
API Routes → API Gateway → Lambda → Expo Server → All API endpoints
```

## Step 1: Update DNS for api.hashpass.tech

### Current Status
- `api.hashpass.tech` currently points to **Amplify Hosting (CloudFront)**
- This causes 404 errors because Amplify only serves static files

### Solution: Point to API Gateway

Once the ACM certificate is validated and custom domain is configured:

```bash
# After running: ./scripts/setup-custom-domain.sh
# Get the API Gateway domain name
TARGET_DOMAIN=$(aws apigatewayv2 get-domain-name --domain-name api.hashpass.tech --region us-east-1 --query 'DomainNameConfigurations[0].TargetDomainName' --output text)

# Update Route 53
aws route53 change-resource-record-sets \
  --hosted-zone-id Z0236404TWGQH7K9IU6F \
  --change-batch "{
    \"Changes\": [{
      \"Action\": \"UPSERT\",
      \"ResourceRecordSet\": {
        \"Name\": \"api.hashpass.tech\",
        \"Type\": \"CNAME\",
        \"TTL\": 300,
        \"ResourceRecords\": [{
          \"Value\": \"$TARGET_DOMAIN\"
        }]
      }
    }]
  }"
```

## Step 2: Integrate Lambda Deployment with Amplify CD

### Option A: Deploy Lambda on Amplify Build (Recommended)

Add to `amplify.yml` in the `build` phase:

```yaml
build:
  phases:
    preBuild:
      commands:
        # ... existing commands ...
    build:
      commands:
        # Build frontend
        - npm run build:web
        
        # Package and deploy Lambda
        - ./scripts/package-lambda.sh
        - |
          if [ -f lambda-deployment.zip ]; then
            aws lambda update-function-code \
              --function-name hashpass-api-handler \
              --region us-east-1 \
              --zip-file fileb://lambda-deployment.zip || echo "Lambda update failed"
          fi
```

### Option B: Use Amplify Build Hooks

Create `amplify.yml` with post-build hook:

```yaml
build:
  phases:
    post_build:
      commands:
        - echo "Deploying Lambda function..."
        - ./scripts/package-lambda.sh
        - |
          aws lambda update-function-code \
            --function-name hashpass-api-handler \
            --region us-east-1 \
            --zip-file fileb://lambda-deployment.zip
```

### Option C: Separate CI/CD Pipeline

Use GitHub Actions or similar to:
1. Build frontend → Deploy to Amplify
2. Package Lambda → Deploy to Lambda
3. Update API Gateway if needed

## Step 3: Environment Variables

### Amplify Environment Variables

Set in Amplify Console → Environment variables:

```bash
# API Configuration
EXPO_PUBLIC_API_BASE_URL=https://api.hashpass.tech/api

# Lambda Configuration (for deployment)
AWS_REGION=us-east-1
LAMBDA_FUNCTION_NAME=hashpass-api-handler
```

### Lambda Environment Variables

Set in Lambda Console or via CLI:

```bash
aws lambda update-function-configuration \
  --function-name hashpass-api-handler \
  --environment Variables="{
    NODE_ENV=production,
    EXPO_PUBLIC_SUPABASE_URL=your-supabase-url,
    SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
  }" \
  --region us-east-1
```

## Step 4: Update Frontend Code

Update API base URL in your code:

```typescript
// lib/api-client.ts or similar
const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL || 'https://api.hashpass.tech/api';
```

## Verification

### Test API Gateway Directly
```bash
curl https://nqt8xep20g.execute-api.us-east-1.amazonaws.com/prod/api/config/versions
```

### Test Custom Domain (after DNS update)
```bash
curl https://api.hashpass.tech/api/config/versions
```

### Check DNS Resolution
```bash
dig api.hashpass.tech
# Should show API Gateway domain, not CloudFront
```

## Amplify App Configuration

**App ID**: `d31bu1ot0gd14y`

**Current Setup**:
- **Frontend Hosting**: Amplify Hosting (static files only)
- **API Routes**: API Gateway + Lambda (separate from Amplify)
- **Domains**:
  - `hashpass.tech` → Amplify Hosting
  - `bsl2025.hashpass.tech` → Amplify Hosting
  - `api.hashpass.tech` → API Gateway (after DNS update)

## Benefits of This Architecture

✅ **Separation of Concerns**: Frontend (Amplify) and API (API Gateway) are independent  
✅ **Scalability**: Lambda auto-scales independently  
✅ **Cost**: Pay only for what you use  
✅ **Flexibility**: Can update API without rebuilding frontend  
✅ **Performance**: API Gateway provides caching and throttling  

## Migration Checklist

- [x] Create Lambda function
- [x] Create API Gateway
- [x] Configure API Gateway routes
- [x] Test API Gateway endpoints
- [ ] Wait for ACM certificate validation
- [ ] Configure custom domain in API Gateway
- [ ] Update DNS to point `api.hashpass.tech` to API Gateway
- [ ] Update frontend `EXPO_PUBLIC_API_BASE_URL`
- [ ] Add Lambda deployment to Amplify build (optional)
- [ ] Remove old Amplify Functions (if any)
- [ ] Test all API endpoints

