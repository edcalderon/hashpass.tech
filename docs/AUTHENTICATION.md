# Provider-Agnostic Authentication System

## Overview

HashPass now uses a provider-agnostic authentication system that supports multiple auth providers (Directus, Supabase, Keycloak) with seamless switching via environment variables.

## Architecture

```
lib/auth/
├── types.ts           # Common interfaces and types
├── providers/
│   ├── directus.ts    # Directus implementation
│   ├── supabase.ts    # Supabase implementation
│   └── keycloak.ts    # Future: Keycloak implementation
├── factory.ts         # Provider factory
└── index.ts          # Main auth service
```

## Usage

### Frontend Authentication

```typescript
import { useAuth } from '../hooks/useAuth';

function MyComponent() {
  const { user, signIn, signOut, isLoading, isLoggedIn } = useAuth();
  
  const handleLogin = async () => {
    const result = await signIn(email, password);
    if (result.error) {
      console.error(result.error);
    }
  };
}
```

### API Authentication

```typescript
import { authenticateRequest, requireAuth, requireAdminAuth } from '@/lib/auth';

export async function GET(request: Request) {
  // Option 1: Get user if authenticated, null if not
  const { user, error } = await authenticateRequest(request);
  
  // Option 2: Require authentication (throws if not authenticated)
  const user = await requireAuth(request);
  
  // Option 3: Require admin authentication
  const adminUser = await requireAdminAuth(request);
}
```

## Provider Configuration

### Directus (Default)
```bash
AUTH_PROVIDER=directus
DIRECTUS_URL=https://sso.hashpass.co
DIRECTUS_ADMIN_EMAIL=admin@hashpass.tech
# Optional: mirror Directus OAuth users into Supabase Auth by email
DIRECTUS_OAUTH_SUPABASE_SYNC_ENABLED=true
# Optional: also establish a Supabase session after Directus OAuth (dual-session bridge)
DIRECTUS_OAUTH_SUPABASE_BRIDGE_ENABLED=true
```

### Hybrid: Directus OAuth + Supabase OTP/Magic Link + Supabase Data

If you use `AUTH_PROVIDER=directus` for Google OAuth but still use Supabase for OTP/magic-link and core tables, enable:

```bash
DIRECTUS_OAUTH_SUPABASE_SYNC_ENABLED=true
DIRECTUS_OAUTH_SUPABASE_BRIDGE_ENABLED=true
SUPABASE_SERVICE_ROLE_KEY=...
EXPO_PUBLIC_SUPABASE_URL=...
```

During successful Directus OAuth callback, the backend will:
1. Resolve the Directus user from the OAuth access token.
2. Create (or update) the matching Supabase Auth user by email.
3. Attach metadata such as `directus_user_id` for cross-system mapping.
4. Issue a one-time Supabase bridge token hash so the client can establish a Supabase session (dual-session).

### Supabase
```bash
AUTH_PROVIDER=supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

### Keycloak (Future)
```bash
AUTH_PROVIDER=keycloak
KEYCLOAK_URL=https://auth.your-domain.com
KEYCLOAK_REALM=hashpass
KEYCLOAK_CLIENT_ID=hashpass-frontend
```

## Provider Switching

To switch providers, simply:

1. Update the `AUTH_PROVIDER` environment variable
2. Add the required configuration for the new provider
3. Restart the application

**No code changes required!**

## Benefits

1. **Zero Breaking Changes**: Existing code continues to work
2. **Environment-Based Switching**: Change providers with env vars only
3. **Consistent API**: Same interface across all providers
4. **Future-Proof**: Easy to add new providers (Keycloak, Auth0, etc.)
5. **Type Safety**: Full TypeScript support across all providers
6. **Cross-Platform**: Works on web, iOS, and Android

## Implementation Details

### Standard User Interface
All providers map their user data to a common `AuthUser` interface:

```typescript
interface AuthUser {
  id: string;
  email: string;
  first_name?: string;
  last_name?: string;
  role?: string;
  status?: string;
  last_access?: string;
  [key: string]: any; // Provider-specific fields
}
```

### Session Management
All providers implement consistent session handling:
- Automatic token refresh
- Secure storage (localStorage/SecureStore)
- Cross-platform compatibility
- State change notifications

### API Token Validation
The system automatically detects the active provider and validates tokens accordingly:
- Directus: Validates against Directus API
- Supabase: Validates against Supabase Auth
- Future providers: Will implement their validation method

## Migration from Legacy Code

Legacy imports will continue to work through compatibility exports:

```typescript
// Old way (still works)
import { directusAuth } from '../lib/directus-auth';

// New way (recommended)
import { authService } from '../lib/auth';
```

## Adding New Providers

To add a new provider:

1. Create `lib/auth/providers/new-provider.ts`
2. Implement the `IAuthProvider` interface
3. Add provider configuration to `AuthProviderConfig`
4. Update the factory in `lib/auth/factory.ts`
5. Add environment variables

Example:
```typescript
// lib/auth/providers/auth0.ts
export class Auth0Provider implements IAuthProvider {
  // Implement all required methods
}

// lib/auth/factory.ts
case 'auth0':
  return new Auth0Provider(config.auth0);
```

## Testing

Test different providers by changing the environment variable:

```bash
# Test with Directus
AUTH_PROVIDER=directus npm run dev

# Test with Supabase  
AUTH_PROVIDER=supabase npm run dev
```

The application will use the specified provider without any code changes.
