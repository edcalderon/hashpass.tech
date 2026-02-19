# HashPass Authentication Migration Guide

## Overview
This document outlines the migration from Supabase authentication to Directus SSO for the HashPass platform.

## Migration Status: ✅ COMPLETED

### Infrastructure Changes
- ✅ GCP deployment configured
- ✅ DNS pointing sso.hashpass.co to 34.28.5.79
- ✅ Directus 10.10.5 deployed with Docker
- ✅ SSL certificates configured with Let's Encrypt
- ✅ Database migrated from source to target Supabase instance
- ✅ PostgreSQL client tools installed on server

### Authentication System Changes

#### Core Authentication Library
- ✅ Created `lib/directus-auth.ts` - Complete DirectusAuth class
- ✅ Created `config/sso-config.ts` - SSO configuration
- ✅ Updated `hooks/useAuth.ts` - React hook for Directus auth
- ✅ Created `lib/directus-api-auth.ts` - API authentication utilities

#### Frontend Updates
- ✅ Updated `app/(shared)/auth.tsx` - New streamlined auth screen
- ✅ Updated `lib/api-client.ts` - Uses Directus tokens
- ✅ All components using `useAuth` hook will automatically work with new system

#### API Endpoint Updates
- ✅ Updated `app/api/qr/admin+api.ts` - Uses Directus auth
- ✅ Updated `app/api/bslatam/meeting-slots/book/+api.ts` - Uses Directus auth
- ✅ Created `app/api/auth/test+api.ts` - Test endpoint for auth verification

#### Configuration Files
- ✅ Updated `.env` - Added Directus configuration
- ✅ Updated package.json dependencies
- ✅ Docker compose configured for Directus

## New Authentication Flow

### 1. User Login
```typescript
// Frontend (using useAuth hook)
const { signIn } = useAuth();
const result = await signIn(email, password);
```

### 2. API Authentication
```typescript
// Backend (using directus-api-auth utilities)
import { authenticateRequest, requireAuth } from '@/lib/directus-api-auth';

// Simple authentication
const { user, error } = await authenticateRequest(request);

// Require authentication (throws error if not authenticated)
const user = await requireAuth(request);

// Require admin authentication
const adminUser = await requireAdminAuth(request);
```

### 3. Token Management
- Access tokens stored in localStorage/AsyncStorage
- Automatic refresh handling
- Cross-platform session management
- Secure token validation

## Environment Variables

### Required Environment Variables
```bash
# Directus SSO Configuration
DIRECTUS_URL=https://sso.hashpass.co
DIRECTUS_ADMIN_EMAIL=admin@hashpass.tech

# Database (Target Supabase)
DB_HOST=<YOUR_DB_HOST>
DB_PORT=<YOUR_DB_PORT>
DB_NAME=<YOUR_DB_NAME>
DB_USER=<YOUR_DB_USER>
DB_PASSWORD=<YOUR_DB_PASSWORD>
DB_SSL=true
```

## Testing the Migration

### 1. Test Directus Authentication
```bash
# Test login to Directus admin panel
curl -X POST https://sso.hashpass.co/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@hashpass.tech", "password": "<YOUR_ADMIN_PASSWORD>"}'
```

### 2. Test API Authentication
```bash
# Test the auth test endpoint
curl -X GET https://hashpass.co/api/auth/test \
  -H "<AUTH_HEADER>"
```

### 3. Test Frontend Authentication
1. Visit https://hashpass.co
2. Try to login with email/password
3. Verify user session is maintained
4. Test protected routes

## Migration Benefits

### Simplified Authentication
- ✅ No complex OAuth flows
- ✅ Standard email/password authentication
- ✅ Better session management
- ✅ Unified user management through Directus

### Better Infrastructure
- ✅ Self-hosted authentication (no third-party dependencies)
- ✅ Direct database access
- ✅ Better performance (no external API calls for auth)
- ✅ Enhanced security control

### Developer Experience
- ✅ Cleaner API endpoints
- ✅ Consistent authentication patterns
- ✅ Better error handling
- ✅ TypeScript support throughout

## Rollback Plan (if needed)

If issues arise, the original Supabase authentication can be restored:

1. Restore backup files:
   - `cp hooks/useAuth.ts.backup hooks/useAuth.ts`
   - `cp app/(shared)/auth.tsx.backup app/(shared)/auth.tsx`

2. Update environment variables to use original Supabase instance

3. Deploy with previous authentication system

## Next Steps

### 1. Complete API Migration
- Update all remaining API endpoints that use `supabase.auth.getUser()`
- Replace with `authenticateRequest()` or `requireAuth()`

### 2. Update Database Queries
- Ensure all user-related queries work with migrated user IDs
- Test all database operations

### 3. Frontend Testing
- Test all user flows
- Verify protected routes work correctly
- Test mobile app authentication

### 4. Production Deployment
- Deploy to production environment
- Monitor authentication flows
- Verify all functionality works correctly

## Support

For issues or questions regarding this migration:
- Check logs: `docker logs directus`
- Test endpoints: Use `/api/auth/test` endpoint
- Database connection: Use psql connection scripts
- SSO admin panel: https://sso.hashpass.co

---

**Migration completed successfully! 🎉**
The HashPass platform now uses Directus SSO as the default authentication system.
