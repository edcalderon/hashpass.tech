# Cloudflare Pages Deployment Guide

## Quick Start

### Option 1: Using npm script (Recommended)
```bash
npm run deploy:cloudflare
```

### Option 2: Using deploy script
```bash
./cloudflare/deploy-pages.sh
```

### Option 3: Manual deployment
```bash
npm run build:web
npx wrangler pages deploy ./dist/client --project-name=hashpass
```

## What Cloudflare Pages Does Automatically

✅ **Static File Serving**: All files in `dist/client/` are served automatically  
✅ **API Routes**: Routes in `dist/client/_expo/functions/api/**/*` are automatically handled  
✅ **SPA Routing**: All routes serve `index.html` for client-side routing  
✅ **HTTPS**: Automatic SSL certificates  
✅ **CDN**: Global content delivery network  
✅ **Custom Domains**: Easy domain configuration in dashboard  

## First Time Setup

1. **Login to Cloudflare:**
   ```bash
   npx wrangler login
   ```

2. **Deploy:**
   ```bash
   npm run deploy:cloudflare
   ```

3. **Your app will be available at:**
   - `https://hashpass.pages.dev` (default)
   - Or your custom domain if configured

## CI/CD Setup (Optional)

You can connect your Git repository to Cloudflare Pages for automatic deployments:

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com) → Pages
2. Click "Create a project" → "Connect to Git"
3. Select your repository
4. Configure:
   - **Build command**: `npm run build:web`
   - **Build output directory**: `dist/client`
   - **Root directory**: `/` (or leave empty)
5. Click "Save and Deploy"

Now every push to your main branch will automatically deploy!

## Environment Variables

Set environment variables in Cloudflare Dashboard:

1. Go to Pages → Your Project → Settings → Environment Variables
2. Add variables like:
   - `EXPO_PUBLIC_API_BASE_URL`
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - etc.

## Custom Domain

1. Go to Pages → Your Project → Custom domains
2. Click "Set up a custom domain"
3. Follow the instructions to configure DNS

## API Routes

API routes in `dist/client/_expo/functions/api/**/*` are automatically handled by Cloudflare Pages Functions.

**No additional configuration needed!** Just deploy and your API routes will work.

Example routes:
- `/api/status` → `dist/client/_expo/functions/api/status+api.js`
- `/api/auth/otp` → `dist/client/_expo/functions/api/auth/otp+api.js`
- `/api/bslatam/agenda` → `dist/client/_expo/functions/api/bslatam/agenda+api.js`

## Troubleshooting

### 404 on API routes
- Ensure `dist/client/_expo/functions/api/` contains your API route files
- Check that the build completed successfully
- Verify the route path matches the file structure

### Static files not loading
- Ensure `dist/client/` contains all static files
- Check that the build output directory is correct
- Verify file paths in your code match the deployed structure

### Build fails
- Check Node.js version (Cloudflare Pages uses Node.js 18+)
- Verify all dependencies are in `package.json`
- Check build logs in Cloudflare Dashboard

## Support

For more information, see:
- [Cloudflare Pages Documentation](https://developers.cloudflare.com/pages/)
- [Cloudflare Pages Functions](https://developers.cloudflare.com/pages/platform/functions/)

