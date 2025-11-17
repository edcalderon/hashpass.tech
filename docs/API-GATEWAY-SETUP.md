# API Gateway + Lambda Setup Guide

Complete step-by-step guide to set up API Gateway with Lambda for HashPass API routes.

## Prerequisites

1. **AWS Account** with appropriate permissions
2. **AWS CLI** installed and configured
3. **Node.js 18+** installed
4. **Project built** (`npm run build:web`)

## Step 1: Create IAM Role for Lambda

1. **Go to IAM Console** → Roles → Create Role
2. **Select**: AWS Lambda
3. **Attach policies**:
   - `AWSLambdaBasicExecutionRole` (for CloudWatch logs)
   - Add any other permissions your API needs (e.g., VPC, S3, etc.)
4. **Name**: `hashpass-lambda-execution-role`
5. **Note the Role ARN** (you'll need it in Step 3)

## Step 2: Build and Package Lambda Function

```bash
# 1. Build the project
npm run build:web

# 2. Create Lambda package directory
mkdir -p lambda-package
cd lambda-package

# 3. Copy Lambda handler
cp ../lambda/index.js .
cp ../lambda/package.json .

# 4. Copy server build (needed by Expo Server)
cp -r ../dist/server ./server

# 5. Install dependencies
npm install --production

# 6. Create deployment package
zip -r ../lambda-deployment.zip . -x "*.git*" "*.DS_Store*"
cd ..
```

## Step 3: Create Lambda Function

```bash
# Replace ACCOUNT_ID and ROLE_NAME with your values
aws lambda create-function \
  --function-name hashpass-api-handler \
  --runtime nodejs20.x \
  --role arn:aws:iam::ACCOUNT_ID:role/hashpass-lambda-execution-role \
  --handler index.handler \
  --zip-file fileb://lambda-deployment.zip \
  --timeout 30 \
  --memory-size 512 \
  --region us-east-1
```

**Or use AWS Console:**
1. Go to Lambda Console → Create Function
2. Name: `hashpass-api-handler`
3. Runtime: Node.js 20.x
4. Architecture: x86_64
5. Execution role: Use existing role → Select `hashpass-lambda-execution-role`
6. Upload deployment package: `lambda-deployment.zip`
7. Handler: `index.handler`
8. Timeout: 30 seconds
9. Memory: 512 MB

## Step 4: Create API Gateway REST API

### 4.1 Create API

```bash
aws apigateway create-rest-api \
  --name hashpassApi \
  --description "HashPass API Gateway" \
  --region us-east-1
```

**Or use AWS Console:**
1. Go to API Gateway Console → Create API
2. Choose REST API → Build
3. Protocol: REST
4. Create new API: New API
5. API name: `hashpassApi`
6. Endpoint Type: Regional
7. Create API

### 4.2 Get Root Resource ID

```bash
API_ID="YOUR_API_ID"  # From previous step
ROOT_RESOURCE_ID=$(aws apigateway get-resources --rest-api-id $API_ID --query 'items[0].id' --output text)
```

### 4.3 Create /api Resource

```bash
aws apigateway create-resource \
  --rest-api-id $API_ID \
  --parent-id $ROOT_RESOURCE_ID \
  --path-part api \
  --region us-east-1
```

**Or use AWS Console:**
1. In API Gateway → Your API → Resources
2. Select "/" (root)
3. Actions → Create Resource
4. Resource Name: `api`
5. Resource Path: `/api`
6. Create Resource

### 4.4 Create /api/{proxy+} Resource

```bash
API_RESOURCE_ID="YOUR_API_RESOURCE_ID"  # From previous step
aws apigateway create-resource \
  --rest-api-id $API_ID \
  --parent-id $API_RESOURCE_ID \
  --path-part "{proxy+}" \
  --region us-east-1
```

**Or use AWS Console:**
1. Select `/api` resource
2. Actions → Create Resource
3. Resource Name: `{proxy+}`
4. Resource Path: `/api/{proxy+}`
5. ✅ Enable Proxy Integration
6. Create Resource

### 4.5 Create ANY Method

```bash
PROXY_RESOURCE_ID="YOUR_PROXY_RESOURCE_ID"  # From previous step
aws apigateway put-method \
  --rest-api-id $API_ID \
  --resource-id $PROXY_RESOURCE_ID \
  --http-method ANY \
  --authorization-type NONE \
  --region us-east-1
```

**Or use AWS Console:**
1. Select `/api/{proxy+}` resource
2. Actions → Create Method → ANY
3. Integration type: Lambda Function
4. ✅ Use Lambda Proxy Integration
5. Lambda Function: `hashpass-api-handler`
6. Region: `us-east-1` (or your region)
7. Save → OK (when prompted to give API Gateway permission)

### 4.6 Deploy API

```bash
aws apigateway create-deployment \
  --rest-api-id $API_ID \
  --stage-name prod \
  --region us-east-1
```

**Or use AWS Console:**
1. Actions → Deploy API
2. Deployment stage: `[New Stage]` or `prod`
3. Stage name: `prod`
4. Stage description: `Production`
5. Deploy

**Note the Invoke URL** (e.g., `https://YOUR_API_ID.execute-api.us-east-1.amazonaws.com/prod`)

## Step 5: Configure Custom Domain

### 5.1 Request ACM Certificate (if not exists)

```bash
aws acm request-certificate \
  --domain-name "*.hashpass.tech" \
  --validation-method DNS \
  --region us-east-1
```

**Or use AWS Console:**
1. Go to ACM Console → Request Certificate
2. Domain name: `*.hashpass.tech`
3. Validation method: DNS
4. Request

**Wait for validation** and add DNS records as instructed.

### 5.2 Create Custom Domain in API Gateway

```bash
CERT_ARN="arn:aws:acm:us-east-1:ACCOUNT_ID:certificate/CERT_ID"
aws apigatewayv2 create-domain-name \
  --domain-name api.hashpass.tech \
  --domain-name-configurations CertificateArn=$CERT_ARN \
  --region us-east-1
```

**Or use AWS Console:**
1. Go to API Gateway → Custom Domain Names → Create
2. Domain name: `api.hashpass.tech`
3. Certificate: Select your ACM certificate
4. Create

### 5.3 Create API Mapping

```bash
DOMAIN_NAME_ID="YOUR_DOMAIN_NAME_ID"  # From previous step
aws apigatewayv2 create-api-mapping \
  --domain-name api.hashpass.tech \
  --api-id $API_ID \
  --stage prod \
  --api-mapping-key "" \
  --region us-east-1
```

**Or use AWS Console:**
1. Select `api.hashpass.tech` domain
2. API mappings → Configure API mappings
3. API: Select `hashpassApi`
4. Stage: `prod`
5. Path: (leave empty)
6. Save

### 5.4 Get Target Domain

```bash
aws apigatewayv2 get-domain-name \
  --domain-name api.hashpass.tech \
  --query 'DomainNameConfigurations[0].TargetDomainName' \
  --output text \
  --region us-east-1
```

**Note this domain** (e.g., `d-xxxxx.execute-api.us-east-1.amazonaws.com`)

## Step 6: Update DNS

1. **Go to Route 53** → Hosted Zones → `hashpass.tech`
2. **Find or create CNAME record**:
   - Name: `api`
   - Type: `CNAME`
   - Value: Target domain from Step 5.4
   - TTL: `300`
3. **Save**

**Wait for DNS propagation** (5-15 minutes, can take up to 48 hours)

## Step 7: Test

```bash
# Test API Gateway directly
curl https://YOUR_API_ID.execute-api.us-east-1.amazonaws.com/prod/api/config/versions

# Test custom domain (after DNS propagation)
curl https://api.hashpass.tech/api/config/versions
```

## Step 8: Update Lambda Function (when code changes)

```bash
# Rebuild and repackage
npm run build:web
cd lambda-package
rm -rf node_modules server
cp -r ../dist/server ./server
npm install --production
zip -r ../lambda-deployment.zip . -x "*.git*" "*.DS_Store*"
cd ..

# Update Lambda function
aws lambda update-function-code \
  --function-name hashpass-api-handler \
  --zip-file fileb://lambda-deployment.zip \
  --region us-east-1
```

## Troubleshooting

### Lambda Function Errors
- Check CloudWatch Logs: Lambda Console → Function → Monitor → View logs
- Verify `dist/server` is included in deployment package
- Check that `@expo/server` is installed

### API Gateway 404
- Verify resource path: `/api/{proxy+}`
- Check method is configured (ANY)
- Verify Lambda integration is set up
- Check API is deployed to a stage

### Custom Domain Issues
- Verify ACM certificate is validated
- Check DNS CNAME record is correct
- Wait for DNS propagation
- Verify API mapping is configured

### CORS Errors
- Lambda handler already includes CORS headers
- If still issues, configure CORS in API Gateway:
  - Enable CORS on `/api/{proxy+}` resource
  - Allow methods: GET, POST, PUT, DELETE, PATCH, OPTIONS
  - Allow headers: Content-Type, Authorization

## Cost Estimation

- **API Gateway**: First 1M requests/month free, then $3.50 per million
- **Lambda**: First 1M requests/month free, then $0.20 per million
- **Data Transfer**: First 1GB/month free, then $0.09/GB

For most use cases, this should be within the free tier.

## Next Steps

After setup is complete:
1. Test all API endpoints
2. Monitor CloudWatch logs
3. Set up CloudWatch alarms for errors
4. Configure API Gateway throttling if needed

