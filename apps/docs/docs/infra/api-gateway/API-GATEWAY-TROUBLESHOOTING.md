# API Gateway Troubleshooting Guide

## Problem: 404 Errors on API Routes

If you're getting 404 errors on `https://api.hashpass.tech/api/*`, it means API Gateway is not configured correctly or the Lambda function is not deployed.

## ⚠️ CRITICAL: DNS Configuration Issue

**Current Status**: `api.hashpass.tech` is pointing to **Amplify Hosting (CloudFront/S3)**, NOT API Gateway.

**Evidence**:
- DNS resolves to AWS CloudFront IPs (18.155.252.x)
- HTTP response shows `server: AmazonS3` and `via: CloudFront`
- Returns 301 redirects instead of API responses

**Solution**: You need to either:
1. **Change DNS to point to API Gateway** (if API Gateway is configured)
2. **Configure API Gateway and update DNS** (if not configured yet)
3. **Use a different subdomain** for API Gateway (e.g., `api-gateway.hashpass.tech`)

## Quick Checklist

### 1. Verify API Gateway Exists
- Go to AWS API Gateway Console
- Check if there's an API named `hashpassApi` or similar
- Verify it has routes configured for `/api/*`

### 2. Verify Lambda Function is Deployed
- Go to AWS Lambda Console
- Check if function `bslApi` or similar exists
- Verify it's deployed and has the latest code
- Check CloudWatch logs for errors

### 3. Verify Custom Domain Configuration
- In API Gateway Console → Custom Domain Names
- Check if `api.hashpass.tech` is configured
- Verify domain status is "Available"
- Check that the API mapping is configured

### 4. Verify DNS Configuration
- Check Route 53 or your DNS provider
- Verify `api.hashpass.tech` has a CNAME or A record
- Should point to API Gateway's domain (not Amplify Hosting)

## Step-by-Step Configuration

### Step 1: Create/Update Lambda Function

1. **Go to AWS Lambda Console**
2. **Create or update function `bslApi`:**
   - Runtime: Node.js 18.x or 20.x
   - Handler: `index.handler` or `handler.handler`
   - Timeout: 30 seconds (or more)
   - Memory: 512 MB (or more)

3. **Upload the function code:**
   - The function should be in `amplify-backend-config/backend/function/bslApi/`
   - Or use the handler from `amplify/function-handler.js`

### Step 2: Configure API Gateway

1. **Create REST API:**
   - Go to API Gateway Console
   - Create new REST API or use existing
   - Name: `hashpassApi`

2. **Create Resource:**
   - Create resource `/api`
   - Create resource `/api/{proxy+}` (catch-all for all API routes)

3. **Create Method:**
   - Select `ANY` method on `/api/{proxy+}`
   - Integration type: Lambda Function
   - Select your Lambda function
   - Enable "Use Lambda Proxy integration"

4. **Deploy API:**
   - Create new stage (e.g., `prod` or `dev`)
   - Note the Invoke URL

### Step 3: Configure Custom Domain

1. **In API Gateway Console → Custom Domain Names:**
   - Click "Create"
   - Domain name: `api.hashpass.tech`
   - Certificate: Select ACM certificate for `*.hashpass.tech` or `hashpass.tech`
   - Click "Create domain name"

2. **Configure API Mapping:**
   - Click on the domain name
   - Click "API mappings" → "Configure API mappings"
   - Add mapping:
     - API: Select your API
     - Stage: Select your stage (e.g., `prod`)
     - Path: (leave empty for root)
   - Save

3. **Get Target Domain:**
   - Note the "API Gateway domain name" (e.g., `d-xxxxx.execute-api.us-east-1.amazonaws.com`)

### Step 4: Configure DNS

1. **In Route 53 or your DNS provider:**
   - Create CNAME record:
     - Name: `api`
     - Type: `CNAME`
     - Value: API Gateway domain name from Step 3
     - TTL: 300

2. **Wait for DNS propagation** (can take up to 48 hours, usually much faster)

### Step 5: Test

1. **Test API Gateway directly:**
   ```
   curl https://YOUR-API-ID.execute-api.REGION.amazonaws.com/prod/api/config/versions
   ```

2. **Test custom domain:**
   ```
   curl https://api.hashpass.tech/api/config/versions
   ```

## Lambda Function Handler

The Lambda function should use Expo Server to handle API routes. Here's a basic handler:

```javascript
const { createRequestHandler } = require('@expo/server/adapter/node');

const handler = createRequestHandler({
  build: require('path').join(__dirname, 'server'),
});

exports.handler = async (event) => {
  try {
    // Convert API Gateway event to Request
    const request = new Request(
      `https://${event.requestContext.domainName}${event.path}${event.rawQueryString ? `?${event.rawQueryString}` : ''}`,
      {
        method: event.httpMethod,
        headers: new Headers(event.headers || {}),
        body: event.body ? event.body : undefined,
      }
    );

    // Handle with Expo Server
    const response = await handler(request);
    const body = await response.text();
    const headers = {};
    response.headers.forEach((value, key) => {
      headers[key] = value;
    });

    return {
      statusCode: response.status,
      headers: {
        ...headers,
        'Access-Control-Allow-Origin': '*',
      },
      body,
    };
  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({ error: error.message }),
    };
  }
};
```

## Common Issues

### Issue: 404 Not Found
**Causes:**
- API Gateway route not configured
- Lambda function not deployed
- Custom domain not mapped to API

**Solutions:**
- Verify API Gateway has `/api/{proxy+}` route
- Check Lambda function exists and is deployed
- Verify custom domain API mapping

### Issue: 502 Bad Gateway
**Causes:**
- Lambda function error
- Lambda timeout
- Lambda not returning correct format

**Solutions:**
- Check CloudWatch logs for Lambda errors
- Increase Lambda timeout
- Verify Lambda returns correct API Gateway format

### Issue: CORS Errors
**Causes:**
- Missing CORS headers in Lambda response
- API Gateway CORS not configured

**Solutions:**
- Add CORS headers in Lambda response (see handler above)
- Configure CORS in API Gateway if needed

### Issue: DNS Not Resolving
**Causes:**
- DNS record not created
- DNS propagation delay
- Wrong DNS record type

**Solutions:**
- Verify CNAME record exists in Route 53
- Wait for DNS propagation (use `dig api.hashpass.tech` to check)
- Ensure using CNAME, not A record

## Verification Commands

```bash
# Check DNS resolution
dig api.hashpass.tech
nslookup api.hashpass.tech

# Test API Gateway directly (replace with your API ID and region)
curl https://YOUR-API-ID.execute-api.us-east-1.amazonaws.com/prod/api/config/versions

# Test custom domain
curl https://api.hashpass.tech/api/config/versions
```

## Next Steps

1. Verify all steps above are completed
2. Check CloudWatch logs for any errors
3. Test the endpoint with curl or Postman
4. If still not working, check API Gateway logs and Lambda logs

