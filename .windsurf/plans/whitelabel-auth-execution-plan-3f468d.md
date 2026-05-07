# White-Label Auth Package — Execution Plan

Build a reusable, infrastructure-agnostic authentication package (`@whitelabel/auth`) implementing a dual-provider architecture with Supabase as the primary source of truth and Directus as the social OAuth provider layer, packaged for NPM distribution with Terraform/Docker infrastructure templates.

---

## Phase 1: Core Foundation

### 1.1 Monorepo Setup
- [ ] Initialize `whitelabel-auth/` monorepo with pnpm workspaces
- [ ] Configure Turbo pipeline (build, dev, test, lint)
- [ ] Set up Changesets for versioning
- [ ] Create package structure: `packages/auth/`, `apps/example-*`
- [ ] Configure multi-entry exports (core, react, react-native, wallet)

### 1.2 Type System & Base Classes
- [ ] Define core interfaces: `AuthProvider`, `Session`, `User`, `AuthResult`
- [ ] Create `BaseAuthProvider` abstract class with standardized methods
- [ ] Implement configuration schemas with Zod validation
- [ ] Set up error hierarchy: `AuthError`, `ProviderError`, `SyncError`, `WalletError`
- [ ] Create storage adapter interfaces (localStorage, SecureStore, AsyncStorage)

### 1.3 Utilities & Crypto
- [ ] Implement platform detection (web/native)
- [ ] Create nonce/challenge generators for wallet auth
- [ ] Build SIWE/SIWS message formatters
- [ ] Add signature verification utilities
- [ ] Set up secure token storage helpers

---

## Phase 2: Provider Implementations

### 2.1 Supabase Provider (Primary)
- [ ] Implement `SupabaseProvider` extending `BaseAuthProvider`
- [ ] Add email/password authentication
- [ ] Implement magic link flows
- [ ] Add OTP (email/SMS) authentication
- [ ] Build session management with auto-refresh
- [ ] Set up real-time auth state subscriptions
- [ ] Handle Row Level Security integration

### 2.2 Directus Provider (OAuth Layer)
- [ ] Create `DirectusProvider` with REST API client
- [ ] Implement OAuth initiation flows (Google, GitHub, Facebook, Twitter)
- [ ] Build OAuth callback handler with token extraction
- [ ] Add cross-domain cookie/session management
- [ ] Implement user profile mapping from Directus to standard format
- [ ] Handle provider availability checks
- [ ] Add role/permission synchronization hooks

### 2.3 Provider Testing
- [ ] Unit tests for Supabase provider (mocked client)
- [ ] Unit tests for Directus provider (mocked API)
- [ ] Integration tests for provider switching
- [ ] OAuth flow simulation tests

---

## Phase 3: Hybrid Architecture & Sync

### 3.1 Sync Engine
- [ ] Design `SyncEngine` class for bidirectional replication
- [ ] Implement user profile sync: Directus → Supabase
- [ ] Build session bridging between providers
- [ ] Add conflict resolution strategies (timestamp, supabase-wins, manual)
- [ ] Create sync queue with retry logic
- [ ] Add sync audit logging

### 3.2 Auth Manager Orchestrator
- [ ] Build `AuthManager` as unified facade
- [ ] Implement provider switching logic
- [ ] Add session aggregation from multiple sources
- [ ] Build auth method routing (email, OAuth, wallet)
- [ ] Create unified session format
- [ ] Implement dual-session establishment (Supabase + Directus)

### 3.3 Sync Flows
- [ ] OAuth sign-in: Directus OAuth → Supabase user creation → Unified session
- [ ] Email sign-in: Direct Supabase with optional Directus replication
- [ ] Wallet sign-in: Challenge → Verification → Supabase user → Session
- [ ] Session refresh: Coordinated refresh across providers
- [ ] Sign-out: Cascading logout with sync cleanup

---

## Phase 4: Wallet Authentication

### 4.1 Ethereum (SIWE - EIP-4361)
- [ ] Implement `SiweAuth` class with message creation
- [ ] Add MetaMask/wallet detection utilities
- [ ] Build challenge-response nonce system
- [ ] Create signature verification (ethers.js)
- [ ] Handle Firefox-specific provider quirks
- [ ] Add error handling for rejected signatures
- [ ] Implement wallet-to-user linking in Supabase

### 4.2 Solana (SIWS)
- [ ] Implement `SiwsAuth` class
- [ ] Add Phantom/Solflare detection
- [ ] Build message signing flow
- [ ] Create base58 signature handling
- [ ] Implement address verification
- [ ] Add multi-wallet support per user

### 4.3 Wallet Manager
- [ ] Create `WalletAuthManager` coordinator
- [ ] Implement wallet availability checks
- [ ] Add wallet type detection (Ethereum vs Solana)
- [ ] Build wallet session establishment
- [ ] Create wallet disconnection handling

---

## Phase 5: React Integration

### 5.1 Core Hooks
- [ ] Build `useAuth()` hook with all authentication methods
- [ ] Implement `useWalletAuth()` for wallet-specific features
- [ ] Add `useSession()` for reactive session state
- [ ] Create `useAuthStatus()` for loading/error states
- [ ] Build `useSyncStatus()` for replication monitoring

### 5.2 Platform-Specific
- [ ] Web: localStorage persistence, window event handling
- [ ] React Native: SecureStore, AsyncStorage, deep linking
- [ ] SSR/Next.js: Server-side session checking
- [ ] Expo: Metro bundler compatibility, platform detection

### 5.3 Provider Component
- [ ] Create `AuthProvider` React context wrapper
- [ ] Implement initialization logic
- [ ] Add automatic session restoration
- [ ] Build auth guards for protected routes
- [ ] Create loading states for auth bootstrap

---

## Phase 6: Infrastructure as Code

### 6.1 Terraform Modules
- [ ] Create `modules/supabase/` for project provisioning
- [ ] Build `modules/directus/` for container deployment
- [ ] Add environment-specific configurations (dev/staging/prod)
- [ ] Implement sync webhook function deployment
- [ ] Create database connection string management
- [ ] Add secret management (service keys, OAuth credentials)

### 6.2 Docker & Local Dev
- [ ] Build `docker-compose.yml` with Supabase + Directus
- [ ] Create initialization scripts for database schema
- [ ] Add health checks and service dependencies
- [ ] Implement hot-reload for local development
- [ ] Build seed data scripts for testing

### 6.3 Kubernetes (Optional)
- [ ] Create Helm charts for scalable deployment
- [ ] Add ingress configuration for routing
- [ ] Implement secret management with sealed-secrets
- [ ] Build horizontal pod autoscaler configs

---

## Phase 7: Database Schema

### 7.1 Supabase Schema
- [ ] Create `user_profiles` table with Directus linkage
- [ ] Build `wallet_auth_methods` table (multi-wallet support)
- [ ] Add `auth_sync_log` for audit trail
- [ ] Set up Row Level Security policies
- [ ] Create indexes for wallet address lookups
- [ ] Add triggers for updated_at timestamps

### 7.2 Directus Collections
- [ ] Configure `directus_users` with Supabase UID field
- [ ] Set up role permissions for user self-management
- [ ] Add OAuth provider metadata storage
- [ ] Create sync status fields
- [ ] Build custom hook for sync triggers

### 7.3 Migration Files
- [ ] Create sequential SQL migration files
- [ ] Build migration runner script
- [ ] Add rollback procedures
- [ ] Implement idempotent migrations

---

## Phase 8: Testing & Validation

### 8.1 Unit Testing
- [ ] Jest/Vitest setup with coverage thresholds
- [ ] Mock providers for isolated testing
- [ ] Crypto/signature verification tests
- [ ] Storage adapter tests
- [ ] Configuration validation tests

### 8.2 Integration Testing
- [ ] OAuth flow E2E tests (mocked providers)
- [ ] Wallet authentication flow tests
- [ ] Sync engine conflict resolution tests
- [ ] Session persistence across reloads
- [ ] Cross-provider session bridging tests

### 8.3 Example Applications
- [ ] Build `apps/example-nextjs` with full auth flows
- [ ] Create `apps/example-expo` for React Native testing
- [ ] Add `apps/example-react` for vanilla React
- [ ] Implement protected route examples
- [ ] Create wallet auth demo pages

---

## Phase 9: Documentation & Publishing

### 9.1 Package Documentation
- [ ] README with quickstart guide
- [ ] API reference (TypeDoc generated)
- [ ] Architecture decision records (ADRs)
- [ ] Migration guide for existing projects
- [ ] Troubleshooting guide

### 9.2 Infrastructure Documentation
- [ ] Terraform deployment guide
- [ ] Docker local development setup
- [ ] Environment variable reference
- [ ] Security best practices
- [ ] Cost optimization guide

### 9.3 NPM Publishing
- [ ] Configure package.json for public access
- [ ] Set up build pipeline for distribution
- [ ] Create provenance attestation
- [ ] Build CHANGELOG with Changesets
- [ ] Implement semantic versioning workflow
- [ ] Create release checklist

---

## Phase 10: Integration with HashPass (Current Project)

### 10.1 Migration Planning
- [ ] Audit current HashPass auth implementation
- [ ] Map existing auth flows to new package
- [ ] Identify breaking changes
- [ ] Create migration path for existing users
- [ ] Plan feature parity validation

### 10.2 Gradual Adoption
- [ ] Install `@whitelabel/auth` in HashPass monorepo
- [ ] Migrate `packages/auth` to use new package
- [ ] Update `useAuth` hook to wrap new implementation
- [ ] Replace direct Supabase calls with package methods
- [ ] Migrate wallet auth to new package

### 10.3 Legacy Support
- [ ] Maintain backward compatibility layer
- [ ] Deprecation warnings for old methods
- [ ] Data migration scripts for user sessions
- [ ] Feature flags for gradual rollout
- [ ] Rollback procedures

---

## Success Criteria

- [ ] Package published to NPM with semantic versioning
- [ ] All auth flows working: email, OAuth, wallet
- [ ] Infrastructure templates deployable via Terraform
- [ ] Local development works with single `docker-compose up`
- [ ] Test coverage >80% for core functionality
- [ ] Example apps demonstrate all features
- [ ] HashPass successfully migrated to new package
- [ ] Documentation complete with quickstart guide

---

## Estimated Timeline

| Phase | Duration | Dependencies |
|-------|----------|--------------|
| Phase 1 | 3 days | None |
| Phase 2 | 4 days | Phase 1 |
| Phase 3 | 4 days | Phase 2 |
| Phase 4 | 3 days | Phase 1 |
| Phase 5 | 2 days | Phases 3-4 |
| Phase 6 | 3 days | Phase 1 |
| Phase 7 | 2 days | Phase 6 |
| Phase 8 | 3 days | Phases 3-5 |
| Phase 9 | 2 days | Phases 6-8 |
| Phase 10 | 3 days | All above |

**Total: ~29 days** (with 2 parallel workstreams for infrastructure)

---

## Risk Mitigation

- **Supabase API Changes**: Abstract all Supabase calls behind provider interface
- **Directus Versioning**: Pin to tested version, update via automated tests
- **Wallet Provider Changes**: Use well-established libraries (ethers, @solana/web3.js)
- **Sync Failures**: Build retry logic, queue system, manual reconciliation tools
- **Cross-Domain Issues**: Test thoroughly with CORS configurations
- **Breaking Changes**: Maintain semantic versioning, provide migration guides

---

## Next Steps (Immediate)

1. **Initialize repository**: Create `whitelabel-auth/` with pnpm + Turbo
2. **Define contracts**: Finalize TypeScript interfaces for all modules
3. **Prototype sync engine**: Build minimal viable sync between Supabase + Directus
4. **Validate architecture**: Test core flows in isolated environment
5. **Begin Phase 1 implementation**: Core types and base classes

---

**Status**: Ready for execution  
**Priority**: High (blocks future HashPass auth enhancements)  
**Owner**: TBD  
**Created**: 2026-02-26
