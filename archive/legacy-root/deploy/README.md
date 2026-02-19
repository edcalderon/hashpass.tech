# HashPass Infrastructure Deployment
# Optimized for GCP e2-micro (free tier)

This folder contains configuration for self-hosted infrastructure using:
- **Directus** - Headless CMS + API + Auth
- **Nginx** - Reverse proxy + SSL termination
- **Flyway** - Database migrations (CLI only, not containerized)
- **PostgreSQL** - External (Supabase Free Tier or other)

## Architecture

```
┌─────────────────┐     ┌─────────────────┐
│   Client App    │────▶│     Nginx       │
│ (Expo/React)    │     │  (SSL + Proxy)  │
└─────────────────┘     └────────┬────────┘
                                 │
                                 ▼
                        ┌─────────────────┐
                        │    Directus     │
                        │  (API + Auth)   │
                        └────────┬────────┘
                                 │
                                 ▼
                        ┌─────────────────┐
                        │   PostgreSQL    │
                        │   (External)    │
                        │   Supabase/RDS  │
                        └─────────────────┘
```

## Memory Footprint (e2-micro: 1GB RAM)

| Component       | Memory | Notes                          |
|-----------------|--------|--------------------------------|
| Directus        | 512MB  | Memory-capped in compose       |
| Nginx           | ~50MB  | Minimal footprint              |
| System          | ~200MB | OS overhead                    |
| **Total**       | ~750MB | Within e2-micro limits         |

## Why This Works on e2-micro

1. **No PostgreSQL container** - Uses external Supabase free tier
2. **No Redis** - Directus works without caching for small loads
3. **No separate workers** - Single Directus instance
4. **Memory limits** - Docker enforces 512MB cap

## Quick Start

1. Copy environment file:
   ```bash
   cp .env.example .env
   # Edit .env with your credentials
   ```

2. Start services:
   ```bash
   docker compose up -d
   ```

3. Set up SSL with Certbot:
   ```bash
   sudo certbot --nginx -d api.yourdomain.com
   ```

4. Run migrations:
   ```bash
   cd ../db
   flyway migrate
   ```

## Files

- `docker-compose.yml` - Directus container config
- `.env.example` - Environment template
- `nginx/` - Nginx configuration files
