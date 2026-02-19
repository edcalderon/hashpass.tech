# HashPass Backend Migration Guide

## Overview

This guide documents the migration strategy from Supabase to a self-hosted infrastructure using:

| Component | Current (Supabase) | Target (Self-Hosted) |
|-----------|-------------------|---------------------|
| **Database** | Supabase PostgreSQL | Supabase PostgreSQL (Free Tier) |
| **Auth** | Supabase Auth | Directus Auth |
| **API** | Supabase Client | Directus REST API |
| **Realtime** | Supabase Realtime | Directus WebSockets |
| **Storage** | Cloudinary | S3/GCS |
| **Compute** | Supabase Edge | GCP e2-micro |

### Why Migrate?

1. **Cost**: Supabase paid tiers are expensive for our usage
2. **Control**: Full control over infrastructure and scaling
3. **Flexibility**: Use best-of-breed services for each component
4. **Vendor Lock-in**: Reduce dependency on single provider

### Migration Phases

```
Phase 1 (Current)     Phase 2              Phase 3
┌───────────────┐    ┌───────────────┐    ┌───────────────┐
│   Supabase    │    │  Hybrid Mode  │    │  Self-Hosted  │
│  (Full Stack) │ ─▶ │ (DB: Supabase │ ─▶ │  (Full Stack) │
│               │    │  API: Directus)│    │               │
└───────────────┘    └───────────────┘    └───────────────┘
```

## Architecture

### Current (Supabase)

```
┌─────────────┐     ┌─────────────────────────────────┐
│  Client App │────▶│           Supabase              │
│   (Expo)    │     │  ┌─────┐ ┌─────┐ ┌──────────┐  │
│             │◀────│  │Auth │ │ DB  │ │ Realtime │  │
└─────────────┘     │  └─────┘ └─────┘ └──────────┘  │
                    └─────────────────────────────────┘
```

### Target (Hybrid)

```
┌─────────────┐     ┌─────────────────────────────────┐
│  Client App │────▶│        GCP e2-micro             │
│   (Expo)    │     │  ┌──────────┐ ┌─────────────┐  │
│             │◀────│  │ Directus │ │   Nginx     │  │
└─────────────┘     │  │(API/Auth)│ │(SSL/Proxy)  │  │
                    │  └────┬─────┘ └─────────────┘  │
                    └───────┼─────────────────────────┘
                            │
                    ┌───────▼─────────────────────────┐
                    │    Supabase (Free Tier)         │
                    │         PostgreSQL              │
                    └─────────────────────────────────┘
```

## Abstraction Layer

The migration uses an abstraction layer that allows switching between providers via environment variable:

```typescript
// lib/backend/index.ts
import { getBackend, isSupabase } from '@/lib/backend';

const backend = getBackend();

// Auth
const { session, error } = await backend.auth.getSession();

// Database
const { data } = await backend.db
  .from('users')
  .select('*')
  .eq('active', true);

// Realtime
const channel = backend.realtime.channel('room');
channel.on('broadcast', { event: 'message' }, handleMessage);
```

### Environment Configuration

```env
# Use Supabase (default)
EXPO_PUBLIC_BACKEND_PROVIDER=supabase
EXPO_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
EXPO_PUBLIC_SUPABASE_KEY=your-anon-key

# Use Directus
EXPO_PUBLIC_BACKEND_PROVIDER=directus
EXPO_PUBLIC_DIRECTUS_URL=https://api.hashpass.tech
EXPO_PUBLIC_DIRECTUS_TOKEN=optional-static-token
```

## File Structure

```
hashpass.tech/
├── lib/
│   ├── backend/
│   │   ├── index.ts          # Provider factory
│   │   ├── types.ts          # Shared types
│   │   ├── interfaces.ts     # Provider interfaces
│   │   ├── supabase/         # Supabase implementation
│   │   │   ├── index.ts
│   │   │   ├── auth.ts
│   │   │   ├── database.ts
│   │   │   ├── realtime.ts
│   │   │   └── storage.ts
│   │   └── directus/         # Directus implementation
│   │       ├── index.ts
│   │       ├── auth.ts
│   │       ├── database.ts
│   │       ├── realtime.ts
│   │       └── storage.ts
│   ├── supabase.ts           # Original Supabase client (kept for compatibility)
│   └── supabase-server.ts    # Server-side Supabase client
│
├── db/
│   ├── README.md
│   ├── flyway.conf.example
│   └── migrations/           # Flyway-compatible migrations
│       ├── V001__init_core_schema.sql
│       ├── V002__meeting_requests_system.sql
│       └── V003__row_level_security.sql
│
├── deploy/
│   ├── README.md
│   ├── docker-compose.yml    # Directus container
│   ├── .env.example
│   ├── setup-server.sh       # GCP setup script
│   └── nginx/
│       └── nginx-site.conf   # Nginx configuration
│
└── supabase/
    └── migrations/           # Original Supabase migrations (kept)
```

## Step-by-Step Migration

### Phase 1: Preparation (No Breaking Changes)

1. **Install abstraction layer** ✅
   - Created `lib/backend/` with provider interfaces
   - Implemented Supabase providers that wrap existing client
   - App continues to work with Supabase unchanged

2. **Test abstraction**
   ```typescript
   // Replace direct Supabase imports gradually
   // Before:
   import { supabase } from '@/lib/supabase';
   
   // After:
   import { getBackend } from '@/lib/backend';
   const backend = getBackend();
   ```

3. **Create portable migrations**
   - Consolidated Supabase migrations in `db/migrations/`
   - Migrations work with both Supabase and Flyway

### Phase 2: Deploy Directus (Parallel Running)

1. **Set up GCP e2-micro**
   ```bash
   # On fresh GCP VM
   cd deploy
   sudo ./setup-server.sh
   ```

2. **Configure Directus**
   ```bash
   cp .env.example .env
   # Edit .env with your Supabase credentials
   vim .env
   ```

3. **Start Directus**
   ```bash
   docker compose up -d
   ```

4. **Configure Nginx + SSL**
   ```bash
   sudo cp nginx/nginx-site.conf /etc/nginx/sites-available/api.hashpass.tech
   sudo ln -s /etc/nginx/sites-available/api.hashpass.tech /etc/nginx/sites-enabled/
   sudo nginx -t
   sudo certbot --nginx -d api.hashpass.tech
   ```

5. **Run migrations**
   ```bash
   cd ../db
   flyway migrate
   ```

6. **Configure Directus collections**
   - Access admin panel: https://api.hashpass.tech/admin
   - Import existing data or map to new collections
   - Set up roles and permissions

### Phase 3: Switch to Directus

1. **Test with staging environment**
   ```env
   EXPO_PUBLIC_BACKEND_PROVIDER=directus
   EXPO_PUBLIC_DIRECTUS_URL=https://api.hashpass.tech
   ```

2. **Verify all features work**
   - Authentication flows
   - Database operations
   - Realtime subscriptions
   - Storage uploads

3. **Gradual rollout**
   - Feature flags for different user segments
   - Monitor for issues

4. **Full migration**
   - Update production environment variables
   - Deprecate Supabase usage

### Phase 4: Future - Migrate Database (Optional)

When/if you want to move off Supabase database:

1. **Export data from Supabase**
   ```bash
   pg_dump -h db.xxx.supabase.co -U postgres -d postgres > backup.sql
   ```

2. **Set up new PostgreSQL**
   - GCP Cloud SQL (if budget allows)
   - Self-hosted on larger VM
   - Neon, PlanetScale, or other

3. **Import data**
   ```bash
   psql -h new-host -U postgres -d postgres < backup.sql
   ```

4. **Update Directus connection**
   ```env
   DB_HOST=new-db-host
   ```

5. **Run Flyway migrations**
   ```bash
   flyway migrate
   ```

## Feature Mapping

### Authentication

| Feature | Supabase | Directus | Notes |
|---------|----------|----------|-------|
| Email/Password | ✅ | ✅ | Native support |
| Magic Link | ✅ | ❌ | Needs custom flow |
| OTP | ✅ | ❌ | Custom endpoint |
| OAuth (Google) | ✅ | ✅ | Configure in Directus |
| OAuth (Discord) | ✅ | ✅ | Configure in Directus |
| Wallet Auth | Custom | Custom | Same custom flow |

### Database

| Feature | Supabase | Directus | Notes |
|---------|----------|----------|-------|
| REST API | ✅ | ✅ | Different URL structure |
| Filtering | PostgREST | Directus Filter | Abstraction handles |
| RPC Functions | ✅ | Flows | Use Directus Flows |
| RLS | Native | Permissions | Different approach |

### Realtime

| Feature | Supabase | Directus | Notes |
|---------|----------|----------|-------|
| Postgres Changes | ✅ | ✅ | WebSocket subscriptions |
| Broadcast | ✅ | Custom | Via Flows |
| Presence | ✅ | Custom | Custom implementation |

## Rollback Plan

If issues arise, rollback is simple:

1. **Change environment variable**
   ```env
   EXPO_PUBLIC_BACKEND_PROVIDER=supabase
   ```

2. **Redeploy app**

The abstraction layer ensures both providers remain functional.

## Cost Comparison

### Supabase Pro (~$25/month)
- Database: 8GB
- Auth: 50K MAU
- Realtime: Included
- Storage: 100GB

### Self-Hosted (~$0-5/month)
- GCP e2-micro: Free (750 hours/month)
- Supabase Free: Database only (~$0)
- Directus: Self-hosted (~$0)
- GCS Storage: ~$0.02/GB
- Domain: ~$12/year

**Savings: ~$240/year**

## Support Matrix

| Component | Supabase Support | Directus Support | Status |
|-----------|------------------|------------------|--------|
| Auth: Email | ✅ Full | ✅ Full | Ready |
| Auth: OAuth | ✅ Full | ✅ Full | Ready |
| Auth: OTP | ✅ Full | ⚠️ Custom | Needs work |
| Auth: Wallet | ⚠️ Custom | ⚠️ Custom | Same |
| DB: CRUD | ✅ Full | ✅ Full | Ready |
| DB: RPC | ✅ Full | ⚠️ Flows | Map to Flows |
| Realtime: Changes | ✅ Full | ✅ Full | Ready |
| Realtime: Broadcast | ✅ Full | ⚠️ Custom | Needs work |
| Storage | ✅ Full | ✅ Full | Ready |

## Checklist

### Pre-Migration
- [x] Create abstraction layer interfaces
- [x] Implement Supabase providers
- [x] Implement Directus providers
- [x] Create provider factory
- [x] Create portable database migrations
- [x] Create deployment configuration
- [ ] Update hooks to use abstraction
- [ ] Test with Supabase provider

### Deployment
- [ ] Set up GCP e2-micro instance
- [ ] Install Docker, Nginx, Certbot
- [ ] Deploy Directus container
- [ ] Configure SSL
- [ ] Run database migrations
- [ ] Configure Directus collections

### Testing
- [ ] Test auth flows
- [ ] Test database operations
- [ ] Test realtime features
- [ ] Load testing on e2-micro
- [ ] Test failover/rollback

### Go-Live
- [ ] Staged rollout to users
- [ ] Monitor for issues
- [ ] Full migration
- [ ] Decommission Supabase paid services

## Questions?

Contact the team or open an issue in the repository.
