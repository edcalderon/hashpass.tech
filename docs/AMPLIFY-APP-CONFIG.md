# Amplify App Configuration

## App Information

**App ID**: `d31bu1ot0gd14y`

## Current Setup

### Frontend Hosting (Amplify)
- **Purpose**: Serve static frontend files only
- **Domains**:
  - `hashpass.tech` → Amplify Hosting
  - `bsl2025.hashpass.tech` → Amplify Hosting
- **Build**: `amplify.yml` → Builds and deploys static files

### API Routes (API Gateway + Lambda)
- **Purpose**: Handle all API endpoints
- **Domain**: `api.hashpass.tech` → API Gateway (needs DNS update)
- **Deployment**: Separate from Amplify

## Integration Options

### Option 1: Separate Deployments (Current - Recommended)

**Frontend**: Amplify auto-deploys on git push  
**API**: Manual deployment when needed

```bash
# Deploy Lambda manually
./scripts/package-lambda.sh
aws lambda update-function-code \
  --function-name hashpass-api-handler \
  --region us-east-1 \
  --zip-file fileb://lambda-deployment.zip
```

**Pros:**
- ✅ Fast Amplify builds
- ✅ Deploy API independently
- ✅ Clear separation

### Option 2: Integrated Deployment

Enable Lambda deployment in `amplify.yml`:

```yaml
post_build:
  commands:
    - ./scripts/deploy-lambda-from-amplify.sh
```

**Requirements:**
- Amplify service role needs Lambda permissions
- Slower builds

### Option 3: GitHub Actions

Create `.github/workflows/deploy.yml` to deploy both:
- Frontend → Amplify (auto)
- API → Lambda (manual trigger or on push)

## DNS Configuration

### Current Status

```
api.hashpass.tech → CloudFront (Amplify Hosting) ❌ WRONG
```

### Required Change

```
api.hashpass.tech → API Gateway ✅ CORRECT
```

**Steps:**
1. Wait for ACM certificate validation
2. Run: `./scripts/setup-custom-domain.sh`
3. Run: `./scripts/update-api-dns.sh`

## Environment Variables

### Amplify Environment Variables

Set in Amplify Console → Environment variables:

```bash
EXPO_PUBLIC_API_BASE_URL=https://api.hashpass.tech/api
```

### Lambda Environment Variables

Set in Lambda Console or via CLI:

```bash
aws lambda update-function-configuration \
  --function-name hashpass-api-handler \
  --environment Variables="{
    NODE_ENV=production,
    EXPO_PUBLIC_SUPABASE_URL=...,
    SUPABASE_SERVICE_ROLE_KEY=...
  }" \
  --region us-east-1
```

## Verification

### Check Amplify App
```bash
aws amplify get-app --app-id d31bu1ot0gd14y
```

### Check DNS
```bash
dig api.hashpass.tech
# Should show API Gateway domain after DNS update
```

### Test API
```bash
curl https://api.hashpass.tech/api/config/versions
```

