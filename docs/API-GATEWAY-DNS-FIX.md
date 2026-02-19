# Fix: api.hashpass.tech DNS Configuration

## Current Problem

`api.hashpass.tech` is currently pointing to **Amplify Hosting (CloudFront)**, not API Gateway. This is why you're getting 404 errors.

**Evidence:**
- DNS resolves to CloudFront IPs: `18.155.252.x`
- HTTP response shows: `server: AmazonS3` and `via: CloudFront`
- Returns 301 redirects instead of API responses

## Solution Options

### Option 1: Point api.hashpass.tech to API Gateway (Recommended)

**Prerequisites:**
- API Gateway must be configured with custom domain `api.hashpass.tech`
- Lambda function must be deployed

**Steps:**

1. **Get API Gateway Domain Name:**
   - Go to API Gateway Console → Custom Domain Names
   - Find `api.hashpass.tech` domain
   - Copy the "API Gateway domain name" (e.g., `d-xxxxx.execute-api.us-east-1.amazonaws.com`)

2. **Update DNS in Route 53:**
   - Go to Route 53 → Hosted Zones → `hashpass.tech`
   - Find CNAME record for `api`
   - Update the value to the API Gateway domain name
   - Save

3. **Wait for DNS propagation** (usually 5-15 minutes)

4. **Test:**
   ```bash
   curl https://api.hashpass.tech/api/config/versions
   ```

### Option 2: Use Different Subdomain for API Gateway

If you want to keep `api.hashpass.tech` for Amplify Hosting:

1. **Create new subdomain** (e.g., `api-gateway.hashpass.tech` or `api-proxy.hashpass.tech`)

2. **Configure in API Gateway:**
   - Create custom domain with new subdomain name
   - Map to your API

3. **Update DNS:**
   - Create CNAME record for new subdomain
   - Point to API Gateway domain

4. **Update frontend code:**
   - Change `EXPO_PUBLIC_API_BASE_URL` to new subdomain

### Option 3: Use Cloudflare Pages (Alternative)

If API Gateway is too complex, use Cloudflare Pages which handles API routes automatically:

```bash
npm run deploy:cloudflare
```

Then update DNS to point `api.hashpass.tech` to Cloudflare Pages.

## Verification

After making DNS changes:

```bash
# Check DNS resolution
dig api.hashpass.tech

# Should show API Gateway domain, not CloudFront
# Example: d-xxxxx.execute-api.us-east-1.amazonaws.com

# Test API endpoint
curl https://api.hashpass.tech/api/config/versions
```

## Current DNS Status

Based on verification:
- `api.hashpass.tech` → `18.155.252.x` (CloudFront/Amplify Hosting) ❌
- Should be → API Gateway domain ✅

## Next Steps

1. **If API Gateway is configured:**
   - Update DNS CNAME to point to API Gateway domain
   - Wait for propagation
   - Test endpoint

2. **If API Gateway is NOT configured:**
   - Follow `docs/API-GATEWAY-TROUBLESHOOTING.md` to set up API Gateway first
   - Then update DNS

3. **Alternative:**
   - Use Cloudflare Pages for API routes (simpler, free)
   - Or use Netlify Functions

