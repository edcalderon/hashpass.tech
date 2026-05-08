# @whitelabel/auth (Archived snapshot)

> Historical documentation for the legacy white-label auth package.
> The active HashPass implementation lives in [`packages/auth`](../../../../packages/auth).

A reusable, infrastructure-agnostic authentication package implementing a dual-provider architecture with **Supabase as the primary source of truth** and **Directus as the social OAuth provider layer**.

## Features

- **Dual Provider Architecture**: Supabase (primary) + Directus (OAuth layer)
- **Multiple Auth Methods**: Email/password, OAuth, Magic Link, OTP, Wallet (Ethereum/Solana)
- **Wallet Authentication**: SIWE (EIP-4361) and SIWS support
- **Cross-Platform**: Web (localStorage), React Native (SecureStore), SSR support
- **TypeScript**: Fully typed with Zod validation
- **Infrastructure as Code**: Terraform + Docker templates included

## Installation

```bash
npm install @whitelabel/auth
# or
pnpm add @whitelabel/auth
# or
yarn add @whitelabel/auth
```

## Quick Start

### 1. Configure Auth Providers

```typescript
import { AuthManager } from '@whitelabel/auth';

const auth = new AuthManager({
  supabase: {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL!,
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  },
  directus: {
    url: process.env.NEXT_PUBLIC_DIRECTUS_URL!,
    oauth: {
      providers: ['google', 'github'],
      redirectUrl: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback`,
    },
  },
  sync: {
    enabled: true,
    strategy: 'webhook',
    conflictResolution: 'supabase-wins',
  },
  storage: {
    type: 'localStorage',
  },
});
```

### 2. Use with React

```tsx
import { AuthProvider, useAuth } from '@whitelabel/auth/react';

// Wrap your app
function App() {
  return (
    <AuthProvider config={authConfig}>
      <YourApp />
    </AuthProvider>
  );
}

// Use in components
function LoginButton() {
  const { signInWithOAuth, signInWithEmail, isLoading } = useAuth();

  return (
    <button onClick={() => signInWithOAuth('google')} disabled={isLoading}>
      Sign in with Google
    </button>
  );
}
```

### 3. Wallet Authentication

```tsx
import { useWalletAuth } from '@whitelabel/auth/react';

function WalletLogin() {
  const { isAvailable, signIn } = useWalletAuth();

  return (
    <>
      {isAvailable('ethereum') && (
        <button onClick={() => signIn('ethereum')}>
          Sign in with MetaMask
        </button>
      )}
      {isAvailable('solana') && (
        <button onClick={() => signIn('solana')}>
          Sign in with Phantom
        </button>
      )}
    </>
  );
}
```

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    APPLICATION LAYER                            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│              @whitelabel/auth PACKAGE                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │  AuthManager │  │   Providers  │  │    Sync      │          │
│  │   (Hybrid)   │  │(Supabase/    │  │   Engine     │          │
│  │              │  │  Directus)   │  │              │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
└─────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┴───────────────┐
              ▼                               ▼
┌─────────────────────────┐     ┌─────────────────────────┐
│      SUPABASE           │     │       DIRECTUS          │
│   (Primary Source)      │     │   (Social OAuth Layer)  │
│  • User Database        │     │  • Google/GitHub OAuth  │
│  • Magic Link/OTP       │     │  • Session Management   │
│  • Row Level Security   │     │  • Role Permissions       │
└─────────────────────────┘     └─────────────────────────┘
```

## API Reference

### AuthManager

The main orchestrator that unifies Supabase and Directus authentication.

```typescript
const auth = new AuthManager(config);

// Authentication methods
await auth.signInWithEmailAndPassword(email, password);
await auth.signInWithOAuth('google');
await auth.signInWithMagicLink(email);
await auth.signInWithOTP(email, phone);
await auth.signInWithWallet('ethereum');
await auth.verifyOTP(code, 'email');
await auth.signOut();

// Session management
const session = await auth.getSession();
await auth.refreshSession();

// State
const isAuthenticated = auth.isAuthenticated();
const user = auth.getUser();

// Events
auth.onAuthStateChange((state) => {
  console.log('Auth state changed:', state);
});
```

### React Hooks

```typescript
// Main auth hook
const {
  user,
  session,
  isAuthenticated,
  isLoading,
  signInWithEmail,
  signInWithOAuth,
  signInWithWallet,
  signOut,
} = useAuth();

// Wallet-specific hook
const { isAvailable, signIn: signInWithWallet } = useWalletAuth();

// Session hook
const { session, refresh } = useSession();

// Auth guard for protected routes
const { isAuthenticated, isLoading } = useAuthGuard(true);
```

## Infrastructure

### Docker (Local Development)

```bash
cd infra/docker
docker-compose up -d
```

This starts:
- Supabase PostgreSQL
- Supabase Auth (GoTrue)
- Supabase REST API
- Supabase Realtime
- Directus

### Terraform (Production)

```bash
cd infra/terraform
terraform init
terraform apply
```

## Database Schema

### User Profiles Table

```sql
CREATE TABLE public.user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  email TEXT NOT NULL,
  first_name TEXT,
  last_name TEXT,
  avatar_url TEXT,
  role TEXT DEFAULT 'authenticated',
  status TEXT DEFAULT 'active',
  
  -- Directus sync fields
  directus_id UUID UNIQUE,
  last_directus_sync TIMESTAMP,
  
  -- Wallet addresses
  eth_address TEXT UNIQUE,
  solana_address TEXT UNIQUE
);
```

### Wallet Auth Methods Table

```sql
CREATE TABLE public.wallet_auth_methods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.user_profiles(id),
  wallet_type TEXT CHECK (wallet_type IN ('ethereum', 'solana')),
  wallet_address TEXT NOT NULL,
  verified_at TIMESTAMP,
  UNIQUE(user_id, wallet_type),
  UNIQUE(wallet_type, wallet_address)
);
```

## Configuration

### Full Configuration Options

```typescript
const config = {
  // Required: Supabase configuration
  supabase: {
    url: string;
    anonKey: string;
    serviceRoleKey?: string; // For server-side operations
  },

  // Optional: Directus configuration (for OAuth)
  directus: {
    url: string;
    staticToken?: string;
    oauth: {
      providers: Array<'google' | 'github' | 'facebook' | 'twitter'>;
      redirectUrl: string;
    };
  },

  // Optional: Sync configuration
  sync: {
    enabled: boolean;
    strategy: 'realtime' | 'polling' | 'webhook';
    pollingInterval?: number;
    conflictResolution: 'supabase-wins' | 'directus-wins' | 'timestamp';
  };

  // Optional: Wallet authentication
  wallet: {
    ethereum?: {
      enabled: boolean;
      chainId: number; // 1 for mainnet, 11155111 for sepolia
    };
    solana?: {
      enabled: boolean;
      network: 'mainnet-beta' | 'testnet' | 'devnet';
    };
  };

  // Required: Storage configuration
  storage: {
    type: 'localStorage' | 'secureStore' | 'asyncStorage' | 'custom';
    customProvider?: StorageAdapter;
  };

  // Optional: Application info
  app: {
    name: string;
    url: string;
  };

  // Optional: Security settings
  security: {
    requireEmailVerification: boolean;
    allowMultipleWallets: boolean;
    maxSessionsPerUser: number;
  };
};
```

## Environment Variables

Create a `.env` file:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Directus
NEXT_PUBLIC_DIRECTUS_URL=http://localhost:8055
DIRECTUS_STATIC_TOKEN=your-static-token

# OAuth Providers
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-secret
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-secret

# App
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

## License

MIT License.

## Contributing

This is an archived snapshot. For the active HashPass auth implementation,
see [`../../../../packages/auth`](../../../../packages/auth) and
[`../../../../docs/AUTH_FLOW.md`](../../../../docs/AUTH_FLOW.md).

## Support

- [Archive root](../../README.md)
- [Current auth flow](../../../../docs/AUTH_FLOW.md)
