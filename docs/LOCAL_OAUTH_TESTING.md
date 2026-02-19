# Local OAuth Testing Guide

## Overview

This guide explains how to test the HashPass OAuth flow locally using a local Directus instance running in Docker.

## Architecture

```
┌─────────────────┐
│  Browser        │
│  localhost:8081 │ ──┐
└─────────────────┘   │
                      │
                      ├──→ /api/auth/oauth/login?provider=google
                      │    ↓
┌──────────────────┐  ├──→ Directus auth endpoint
│  Directus OAuth  │  │    (http://localhost:8055/auth/login?provider=google)
│  localhost:8055  │  │    ↓
└──────────────────┘  └──→ Google OAuth (with Directus credentials)
                            ↓
                      Google authenticates
                            ↓
                      Directus processes OAuth
                            ↓
                      Redirect to /auth/callback
                            ↓
                      Web app stores tokens
```

## Setup Steps

### 1. Start Directus Locally

```bash
cd apps/directus
docker-compose up -d
```

Directus will be available at: `http://localhost:8055`

### 2. Configure Environment

The web app uses `.env.local` for local development. It should already have:

```bash
# From apps/web-app/.env.local
DIRECTUS_URL=http://localhost:8055
```

### 3. Start Web App Dev Server

```bash
pnpm run dev
```

The web app will be available at: `http://localhost:8081`

### 4. Test OAuth Login

1. Go to `http://localhost:8081/auth`
2. Click "Sign in with Google"
3. You'll be redirected to Google OAuth
4. After authenticating, you'll be redirected back to the dashboard

## Environment Configuration

### Local Development (`.env.local`)
- Directus: `http://localhost:8055`
- Uses local Docker instance
- Allows HTTP for testing

### Staging (`.env.staging`)
- Directus: `https://sso-dev.hashpass.co`
- Uses staging environment
- HTTPS required

### Production (`.env.production`)
- Directus: `https://sso.hashpass.co`
- Uses production environment
- HTTPS required

## Environment Selection

Expo automatically loads `.env.local` if it exists. To use different environments:

```bash
# Local development (automatic)
pnpm run dev

# Staging (manually load .env.staging)
# Rename .env.staging to .env.local, or
# export DIRECTUS_URL=https://sso-dev.hashpass.co

# Production (use .env.production)
# export NODE_ENV=production
```

## Troubleshooting

### "Missing required parameter: client_id"

**Problem**: OAuth fails with missing client_id error.

**Solution**: 
- Check that Directus has Google OAuth credentials in `.env`
- Verify `AUTH_PROVIDERS=local,google` in Directus `.env`
- Restart Directus: `docker-compose restart directus`

### "Authorization Error: Access blocked"

**Problem**: Google redirects back to Directus with error.

**Solution**:
- Check Google OAuth callback URL is configured to allow `http://localhost:8055` or `https://sso.hashpass.co`
- Verify Directus `AUTH_GOOGLE_REDIRECT_ALLOW_LIST` includes `http://localhost:8081/auth/callback`

### Cannot connect to Directus

**Problem**: Web app can't reach `http://localhost:8055`

**Solution**:
- Verify Directus is running: `docker-compose ps`
- Check Directus logs: `docker-compose logs directus`
- Verify port is exposed: `docker ps | grep directus`

### OAuth redirects but doesn't log in

**Problem**: Redirected to auth page with error after OAuth completes.

**Solution**:
- Check browser console for errors
- Check Directus logs: `docker-compose logs -f directus`
- Check web app logs: `pnpm run dev` terminal output
- Verify `/auth/callback` endpoint is reachable: `curl http://localhost:8081/api/auth/oauth/callback`

## Local Network Testing

If you need to test from a device on your local network (not localhost):

1. Get your machine's local IP:
   ```bash
   hostname -I  # Linux
   ipconfig    # Windows
   ifconfig    # Mac
   ```

2. Update `.env.local`:
   ```
   DIRECTUS_URL=http://192.168.x.x:8055
   ```

3. Update docker-compose environment:
   ```bash
   DIRECTUS_HOST=0.0.0.0 docker-compose up -d
   ```

4. Update browser URL to use your IP instead of localhost

## Switching Between Environments

To quickly switch between local, staging, and production:

```bash
# Use local
mv .env.local .env

# Use staging
mv .env .env.local
mv .env.staging .env

# Use production
mv .env .env.staging
mv .env.production .env
```

Or create a script:

```bash
#!/bin/bash
# switch-env.sh
# Usage: ./switch-env.sh local|staging|production

ENV=$1
cd apps/web-app

case "$ENV" in
  local)
    cp .env.local .env
    echo "Switched to local development"
    ;;
  staging)
    cp .env.staging .env
    echo "Switched to staging"
    ;;
  production)
    cp .env.production .env
    echo "Switched to production"
    ;;
  *)
    echo "Usage: $0 local|staging|production"
    exit 1
    ;;
esac
```
