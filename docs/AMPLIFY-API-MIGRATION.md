# Migrating from Amplify API to API Gateway + Lambda

## Current Situation

- **API Amplify App ID**: `d31bu1ot0gd14y` (api.hashpass.tech, region: us-east-2) - **DELETE THIS**
- **Frontend Amplify App**: Different app for hashpass.tech - **KEEP THAT ONE**
- **Frontend**: Hosted on Amplify (static files only)
- **API Routes**: Now using API Gateway + Lambda (separate from Amplify)

## What to Do with api.hashpass.tech

### ✅ DELETE Amplify App for api.hashpass.tech

**You should DELETE the Amplify app `d31bu1ot0gd14y`** because:

1. **No frontend needed** - API Gateway + Lambda handles everything
2. **Redundant** - We're not using Amplify for API anymore
3. **Cost savings** - One less app to maintain

**Steps:**
1. **Delete Amplify app**: Run `./scripts/delete-amplify-api-app.sh`
2. **Update DNS** to point to API Gateway (not Amplify)
3. **Keep the domain** - it's needed for your API

### ✅ DO Update DNS

Currently `api.hashpass.tech` points to **Amplify Hosting**, which only serves static files. You need to point it to **API Gateway**.

**Steps:**

1. **Wait for ACM certificate validation** (run `./scripts/validate-acm-certificate.sh`)
2. **Configure custom domain in API Gateway** (run `./scripts/setup-custom-domain.sh`)
3. **Update DNS** (run `./scripts/update-api-dns.sh`)

## Amplify Configuration

### What Amplify Does Now

**Amplify is ONLY for frontend hosting:**
- Serves static files (HTML, CSS, JS)
- Handles SPA routing
- Does NOT execute API routes

**Domains:**
- `hashpass.tech` → Amplify Hosting (frontend)
- `bsl2025.hashpass.tech` → Amplify Hosting (frontend)
- `api.hashpass.tech` → API Gateway (API routes) ← **Needs DNS update**

### Amplify Build Configuration

Your `amplify.yml` should:
- ✅ Build frontend (`npm run build:web`)
- ✅ Deploy static files to Amplify
- ❌ NOT try to deploy API routes (they're in Lambda now)

**Current `amplify.yml` is correct** - it only builds and deploys the frontend.

## Integrating Lambda with Amplify CD

### Option 1: Deploy Lambda on Every Amplify Build

Add to `amplify.yml`:

```yaml
build:
  phases:
    post_build:
      commands:
        # Deploy Lambda function
        - echo "Deploying Lambda function..."
        - ./scripts/package-lambda.sh
        - |
          aws lambda update-function-code \
            --function-name hashpass-api-handler \
            --region us-east-1 \
            --zip-file fileb://lambda-deployment.zip || echo "Lambda update skipped"
```

**Pros:**
- ✅ Automatic deployment
- ✅ API always matches frontend version

**Cons:**
- ⚠️ Slower builds
- ⚠️ Requires Lambda deployment permissions in Amplify

### Option 2: Separate Deployment (Recommended)

Keep Lambda deployment separate:

```bash
# Manual deployment when needed
./scripts/package-lambda.sh
aws lambda update-function-code \
  --function-name hashpass-api-handler \
  --region us-east-1 \
  --zip-file fileb://lambda-deployment.zip
```

**Pros:**
- ✅ Faster Amplify builds
- ✅ Deploy API independently
- ✅ Better separation of concerns

**Cons:**
- ⚠️ Manual step required

### Option 3: GitHub Actions / CI/CD

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy

on:
  push:
    branches: [main, bsl2025]

jobs:
  deploy-frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Trigger Amplify build
        run: |
          # Amplify auto-deploys on push
          echo "Amplify will auto-deploy"
  
  deploy-api:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: aws-actions/configure-aws-credentials@v2
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: us-east-1
      - name: Package Lambda
        run: ./scripts/package-lambda.sh
      - name: Deploy Lambda
        run: |
          aws lambda update-function-code \
            --function-name hashpass-api-handler \
            --region us-east-1 \
            --zip-file fileb://lambda-deployment.zip
```

## Summary

### What to Keep
- ✅ Amplify App (`d31bu1ot0gd14y`) - for frontend hosting
- ✅ Domain `api.hashpass.tech` - update DNS to point to API Gateway

### What to Update
- 🔄 DNS: `api.hashpass.tech` → API Gateway (not Amplify)
- 🔄 Frontend: Set `EXPO_PUBLIC_API_BASE_URL=https://api.hashpass.tech/api`

### What to Remove
- ❌ **Amplify App `d31bu1ot0gd14y`** (api.hashpass.tech, us-east-2) - DELETE THIS
- ❌ Amplify Functions (if any) - no longer needed
- ❌ API routes in `amplify.yml` - handled by API Gateway now

## Next Steps

1. **Delete Amplify app for API**: `./scripts/delete-amplify-api-app.sh`
2. **Wait for certificate validation**: `./scripts/validate-acm-certificate.sh`
3. **Setup custom domain**: `./scripts/setup-custom-domain.sh`
4. **Update DNS**: `./scripts/update-api-dns.sh`
5. **Test**: `curl https://api.hashpass.tech/api/config/versions`
6. **Update frontend**: Set `EXPO_PUBLIC_API_BASE_URL` in Amplify environment variables (app `d31bu1ot0gd14y`)

