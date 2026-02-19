# Cloudflare Deployment Guide

## Problem: 404 Error on Workers URL

If you're getting a 404 error on your Workers URL, it's because:

1. **You're deploying to Cloudflare Workers** (workers.dev domain)
2. **But the configuration is set up for Cloudflare Pages** (which uses a different deployment method)

## Solution: Use Cloudflare Pages (Recommended)

Cloudflare Pages is better suited for static sites with API routes. Here's how to fix it:

### Quick Deploy to Cloudflare Pages

**Option A: Using the deploy script (easiest)**
```bash
./cloudflare/deploy-pages.sh
```

**Option B: Manual deployment**

1. **Build your project:**
   ```bash
   npm run build:web
   ```

2. **Deploy to Cloudflare Pages:**
   ```bash
   npx wrangler pages deploy ./dist/client --project-name=hashpass
   ```

**Option C: Using Cloudflare Dashboard (for CI/CD)**

1. Go to Cloudflare Dashboard → Pages
2. Create a new project or connect your Git repository
3. Set build command: `npm run build:web`
4. Set output directory: `dist/client`
5. Pages will automatically deploy on every push to your repository

### Option 2: Use Cloudflare Workers (If you must)

If you need to use Workers instead of Pages:

1. **Update `wrangler.toml`:**
   ```toml
   # Comment out the [site] section
   # [site]
   # bucket = "./dist/client"
   
   # Uncomment the Worker configuration
   main = "./cloudflare/worker.js"
   compatibility_flags = ["nodejs_compat"]
   ```

2. **Deploy:**
   ```bash
   npx wrangler deploy
   ```

**Note:** Workers have limitations for serving static files. Pages is recommended for static sites.

## Current Configuration

The `wrangler.toml` is currently configured for **Cloudflare Workers**.

To deploy:
```bash
npm run build:web
npx wrangler deploy
```

### Serving Static Assets with Workers

To serve static assets with Workers, you have two options:

1. **Use ASSETS binding (requires Workers Paid plan $5/month):**
   - Uncomment the `[assets]` section in `wrangler.toml`
   - This allows the worker to serve static files from `./dist/client`

2. **Use Cloudflare Pages (free, recommended for static sites):**
   - Switch back to Pages configuration
   - Use `npx wrangler pages deploy ./dist/client`

## API Routes

**IMPORTANT:** API routes in Metro format cannot be executed directly in Cloudflare Workers.

### Option 1: Use Cloudflare Pages Functions (FREE - Recommended)

Cloudflare Pages Functions automatically handles API routes in:
- `dist/client/_expo/functions/api/**/*`

These are automatically deployed with Pages and don't need separate configuration.

**Deploy to Pages:**
```bash
npm run build:web
npx wrangler pages deploy ./dist/client --project-name=hashpass
```

### Option 2: Proxy to External API Backend

If you must use Workers, you can proxy API requests to an external backend:

1. **Set `API_BACKEND_URL` environment variable:**
   ```bash
   # In Cloudflare Dashboard → Workers & Pages → Your Worker → Settings → Variables
   API_BACKEND_URL = "https://your-api-backend.com"
   ```

2. **Or in `wrangler.toml` (NOT recommended for production):**
   ```toml
   [vars]
   API_BACKEND_URL = "https://your-api-backend.com"
   ```

The worker will automatically proxy all `/api/*` requests to the configured backend URL.

### Option 3: Use Netlify or Amplify for API Routes

If you need full API route support, consider using:
- **Netlify Functions** (free tier available)
- **AWS Amplify** (free tier available)

Both support Expo Server API routes out of the box.

## Cloudflare Access JWT Validation

The worker includes support for validating Cloudflare Access JWTs. This is useful when Cloudflare Access is configured in front of your Worker.

### Configuration

1. **Set environment variables in Cloudflare Dashboard (RECOMMENDED) or `wrangler.toml`:**
   ```toml
   [vars]
   POLICY_AUD = "your-policy-audience-hash-here"
   TEAM_DOMAIN = "https://your-team-domain.cloudflareaccess.com"
   ```
   
   **⚠️ SECURITY WARNING:** Never commit real secrets to git! Use Cloudflare Dashboard or a local `.env` file that's in `.gitignore`.

2. **Or set via Cloudflare Dashboard:**
   - Go to Workers & Pages → Your Worker → Settings → Variables
   - Add `POLICY_AUD` and `TEAM_DOMAIN` as environment variables

### How It Works

- When `POLICY_AUD` and `TEAM_DOMAIN` are set, the worker validates the JWT from the `Cf-Access-Jwt-Assertion` header
- Valid tokens allow the request to proceed
- Invalid or missing tokens return a 403 Forbidden response
- User information (email, sub) is available in the JWT payload after validation

### Dependencies

The worker uses the `jose` package for JWT verification. It's already added to `package.json`.

### Testing

To test without Cloudflare Access, simply don't set the `POLICY_AUD` and `TEAM_DOMAIN` environment variables. The worker will skip JWT validation.

