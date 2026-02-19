# Amplify API Routes Configuration

## Problem

Amplify Hosting only serves static files. Expo Server API routes (in `_expo/functions/api/**/*`) are JavaScript files that need to be executed as serverless functions, not served as static files.

## Current Status

The API routes are being built and copied to `dist/client/_expo/functions/api/`, but Amplify Hosting cannot execute them directly.

## Solutions

### Option 1: Use Amplify Functions (Lambda@Edge) - Recommended

Configure Amplify Functions to handle API routes:

1. **Create Amplify Function:**
   - Go to AWS Amplify Console → Your App → Functions
   - Create a new function or use existing `bslApi` function
   - Configure it to handle `/api/*` routes

2. **Update `amplify.yml` to use rewrites instead of redirects:**
   ```yaml
   rewrites:
     - source: '/api/<*>'
       target: '/api/<*>'
       status: 200
   ```

3. **Configure Lambda function handler** to use Expo Server:
   ```javascript
   const { createRequestHandler } = require('@expo/server/adapter/node');
   const handler = createRequestHandler({
     build: require('path').join(__dirname, '../dist/server'),
   });
   ```

### Option 2: Use API Gateway + Lambda (Current Setup) ✅

**You're using `api.hashpass.tech` which suggests API Gateway is already configured.**

1. **Verify Lambda function is deployed:**
   - Check AWS Lambda Console
   - Ensure function `bslApi` or similar exists
   - Verify it has access to `dist/server/_expo/functions/api/`

2. **Configure API Gateway routes:**
   - Ensure `/api/config/versions` is mapped to your Lambda function
   - Check API Gateway stage configuration
   - Verify the route pattern matches: `/api/*` or `/api/config/versions`

3. **Verify API Gateway custom domain:**
   - Check that `api.hashpass.tech` is configured in API Gateway
   - Verify custom domain mapping is active
   - Check DNS records point to API Gateway

4. **Important**: Do NOT add redirects for `/api/*` routes in `amplify.yml`
   - These routes should be handled by API Gateway, not Amplify Hosting
   - Redirects in `amplify.yml` will interfere with API Gateway routing

### Option 3: Use Netlify or Cloudflare Pages

Both platforms have native support for Expo Server API routes:

- **Netlify Functions**: Automatically handles `_expo/functions/api/**/*`
- **Cloudflare Pages Functions**: Automatically handles `_expo/functions/api/**/*`

## Current Configuration

The `amplify.yml` file:
- Builds API routes to `dist/client/_expo/functions/api/`
- Copies them to `amplify-backend-config/backend/function/bslApi/src/server/_expo/functions/api/`
- Sets up redirects (but these don't execute the code)

## Next Steps

1. **Verify Lambda function exists and is deployed**
2. **Check API Gateway configuration for `/api/config/versions` route**
3. **Ensure Lambda function has access to the built API routes**
4. **Test the endpoint: `https://api.hashpass.tech/api/config/versions`**

## Troubleshooting

### 404 Error
- Check if Lambda function is deployed
- Verify API Gateway route configuration
- Check CloudWatch logs for errors

### Function not executing
- Verify Lambda handler is correct
- Check that `@expo/server` is installed in Lambda
- Ensure `dist/server` is available in Lambda package

### CORS errors
- Add CORS headers in Lambda response
- Configure CORS in API Gateway

