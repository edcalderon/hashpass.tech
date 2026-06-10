# Monorepo Migration Plan: Turborepo + pnpm Workspaces

## 📋 Current State Analysis

### Current Repository Structure Issues

1. **Flat Structure**: Everything is at root level
   - `app/` - Expo Router application
   - `lib/` - Shared libraries mixed with app code
   - `components/` - UI components (some shared, some app-specific)
   - `hooks/` - React hooks
   - `config/` - Configuration files
   - `deploy/` - Directus docker-compose setup
   - `types/` - TypeScript types
   - `scripts/` - Build/deploy scripts scattered
   - `db/` - Database migrations
   - `packages/infra/terraform/` - Infrastructure as code

2. **No Clear Separation**:
   - Shared code mixed with app-specific code
   - Directus setup not isolated as a package
   - Build scripts not organized
   - No workspace boundaries

3. **Scalability Concerns**:
   - Hard to add new apps (mobile, admin panel, etc.)
   - Shared code changes affect everything
   - No clear dependency graph
   - Difficult to test in isolation

---

## 🎯 Target Monorepo Structure

```
hashpass.tech/
├── apps/
│   ├── web-app/              # Main Expo Router web application
│   │   ├── app/              # Expo Router routes
│   │   ├── components/       # App-specific components
│   │   ├── hooks/            # App-specific hooks
│   │   ├── package.json
│   │   └── ...
│   │
│   └── directus/             # Directus SSO package (for local testing)
│       ├── docker-compose.yml
│       ├── .env.example
│       ├── package.json
│       └── README.md
│
├── packages/
│   ├── auth/                 # @hashpass/auth
│   │   ├── src/
│   │   │   ├── providers/    # Directus, Supabase providers
│   │   │   ├── hooks/        # useAuth, useDirectusAuth
│   │   │   └── api/          # API auth utilities
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── ui/                   # @hashpass/ui
│   │   ├── src/
│   │   │   ├── components/   # Shared UI components
│   │   │   └── styles/       # Shared styles
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── config/               # @hashpass/config
│   │   ├── src/
│   │   │   ├── sso-config.ts
│   │   │   ├── branding.ts
│   │   │   ├── features.ts
│   │   │   └── events.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── types/                # @hashpass/types
│   │   ├── src/
│   │   │   ├── auth.ts
│   │   │   ├── events.ts
│   │   │   ├── agenda.ts
│   │   │   └── index.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── utils/                # @hashpass/utils
│   │   ├── src/
│   │   │   ├── string-utils.ts
│   │   │   ├── performance-utils.ts
│   │   │   └── ...
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── backend/              # @hashpass/backend
│   │   ├── src/
│   │   │   ├── directus/
│   │   │   ├── supabase/
│   │   │   └── interfaces.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── eslint-config/       # @hashpass/eslint-config
│       ├── package.json
│       └── index.js
│
├── packages/tools/
│   ├── scripts/              # Shared build/deploy scripts
│   └── db/                   # Database migrations (Flyway)
│
├── infrastructure/
│   └── terraform/            # Terraform IaC
│
├── .github/
│   └── workflows/            # CI/CD workflows
│
├── turbo.json                # Turborepo configuration
├── pnpm-workspace.yaml       # pnpm workspace configuration
├── package.json              # Root package.json
├── pnpm-lock.yaml
└── README.md
```

---

## 🏗️ Package Breakdown

### Apps

#### `apps/web-app`
- **Purpose**: Main Expo Router web application
- **Contains**:
  - `app/` - Expo Router routes and pages
  - App-specific components (not shared)
  - App-specific hooks
  - App configuration
- **Dependencies**: All `@hashpass/*` packages

#### `apps/directus`
- **Purpose**: Directus SSO setup for local development/testing
- **Contains**:
  - `docker-compose.yml`
  - `.env.example`
  - Setup scripts
  - Documentation
- **Dependencies**: None (standalone Docker setup)

### Packages

#### `packages/auth` (@hashpass/auth)
- **Purpose**: Authentication logic and providers
- **Contains**:
  - `lib/auth/providers/directus.ts`
  - `lib/auth/providers/supabase.ts`
  - `lib/directus-auth.ts`
  - `lib/directus-api-auth.ts`
  - `lib/wallet-auth.ts`
  - `hooks/useAuth.ts`
  - `hooks/useDirectusAuth.ts`
- **Exports**: Auth providers, hooks, API utilities

#### `packages/ui` (@hashpass/ui)
- **Purpose**: Shared UI components
- **Contains**:
  - `components/ui/` - Base UI components (Button, Avatar, etc.)
  - Shared component patterns
- **Exports**: Reusable React components

#### `packages/config` (@hashpass/config)
- **Purpose**: Shared configuration
- **Contains**:
  - `config/sso-config.ts`
  - `config/branding.ts`
  - `config/features.ts`
  - `config/events.ts`
- **Exports**: Configuration objects and types

#### `packages/types` (@hashpass/types)
- **Purpose**: Shared TypeScript types
- **Contains**:
  - `types/auth.ts`
  - `packages/types/src/events.ts`
  - `packages/types/src/agenda.ts`
  - `packages/types/src/theme.ts`
- **Exports**: Type definitions

#### `packages/utils` (@hashpass/utils)
- **Purpose**: Shared utility functions
- **Contains**:
  - `lib/string-utils.ts`
  - `lib/performance-utils.ts`
  - `lib/utils.ts`
- **Exports**: Utility functions

#### `packages/backend` (@hashpass/backend)
- **Purpose**: Backend provider abstractions
- **Contains**:
  - `lib/backend/directus/`
  - `lib/backend/supabase/`
  - `lib/backend/interfaces.ts`
- **Exports**: Backend provider interfaces and implementations

---

## 📦 Migration Strategy

### Phase 1: Setup Infrastructure (Day 1)

1. **Install Turborepo and pnpm**
   ```bash
   npm install -g pnpm turbo
   pnpm init
   ```

2. **Create workspace configuration**
   - `pnpm-workspace.yaml`
   - `turbo.json`
   - Root `package.json` with workspace scripts

3. **Set up TypeScript path aliases**
   - Update `tsconfig.json` for each package
   - Configure path mappings

### Phase 2: Create Package Structure (Day 2-3)

1. **Create packages directory structure**
   ```bash
   mkdir -p packages/{auth,ui,config,types,utils,backend}
   mkdir -p apps/{web-app,directus}
   ```

2. **Migrate shared code to packages**
   - Move `lib/auth/*` → `packages/auth/src/`
   - Move `lib/backend/*` → `packages/backend/src/`
   - Move `config/*` → `packages/config/src/`
   - Move `types/*` → `packages/types/src/`
   - Move `lib/utils.ts` → `packages/utils/src/`
   - Move shared `components/ui/*` → `packages/ui/src/`

3. **Create package.json for each package**
   - Set up proper dependencies
   - Configure exports

### Phase 3: Migrate Web App (Day 4-5)

1. **Move app to apps/web-app**
   ```bash
   mv app apps/web-app/app
   mv components apps/web-app/components  # App-specific only
   mv hooks apps/web-app/hooks            # App-specific only
   ```

2. **Update imports**
   - Replace `@/lib/auth` → `@hashpass/auth`
   - Replace `@/config` → `@hashpass/config`
   - Replace `@/types` → `@hashpass/types`
   - Update all relative imports

3. **Update package.json**
   - Add workspace dependencies
   - Update scripts

### Phase 4: Migrate Directus (Day 6)

1. **Create apps/directus**
   ```bash
   mv deploy/docker-compose.yml apps/directus/
   mv deploy/.env.example apps/directus/
   ```

2. **Create package.json**
   - Add scripts for local development
   - Document usage

### Phase 5: Update Build & Deploy (Day 7)

1. **Migrate scripts**
   - Move shared scripts to `packages/tools/scripts/`
   - Update build scripts for Turborepo
   - Update CI/CD workflows

2. **Update infrastructure**
   - Move `terraform/` → `packages/infra/terraform/`
   - Update deployment scripts

### Phase 6: Testing & Cleanup (Day 8)

1. **Test builds**
   - Verify all packages build
   - Test web-app build
   - Test Directus setup

2. **Cleanup**
   - Remove old directories
   - Update documentation
   - Update `.gitignore`

---

## 🔧 Configuration Files

### `pnpm-workspace.yaml`
```yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

### `turbo.json`
```json
{
  "$schema": "https://turbo.build/schema.json",
  "globalDependencies": ["**/.env.*local"],
  "pipeline": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", ".next/**", "storybook-static/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "lint": {
      "dependsOn": ["^lint"]
    },
    "test": {
      "dependsOn": ["^build"],
      "outputs": ["coverage/**"]
    }
  }
}
```

### Root `package.json`
```json
{
  "name": "hashpass-monorepo",
  "private": true,
  "scripts": {
    "dev": "turbo run dev",
    "build": "turbo run build",
    "lint": "turbo run lint",
    "test": "turbo run test",
    "clean": "turbo run clean && rm -rf node_modules",
    "format": "prettier --write \"**/*.{ts,tsx,md}\""
  },
  "devDependencies": {
    "turbo": "latest",
    "prettier": "^3.0.0"
  },
  "engines": {
    "node": ">=18.0.0",
    "pnpm": ">=8.0.0"
  }
}
```

---

## 📊 Benefits of This Structure

### 1. **Scalability**
- Easy to add new apps (mobile app, admin panel, etc.)
- Clear boundaries between apps and packages
- Independent versioning of packages

### 2. **Maintainability**
- Shared code in one place
- Changes to shared code affect all apps consistently
- Clear dependency graph
- Easier code reviews

### 3. **Developer Experience**
- Faster builds with Turborepo caching
- Better IDE support with clear package boundaries
- Easier local development
- Better testing isolation

### 4. **Future-Proofing**
- Can extract packages to separate repos if needed
- Can publish packages to npm if desired
- Supports micro-frontend architecture
- Easy to add new team members

---

## 🚨 Migration Risks & Mitigation

### Risk 1: Breaking Changes During Migration
**Mitigation**: 
- Migrate incrementally
- Keep old structure until migration complete
- Test each phase thoroughly

### Risk 2: Import Path Updates
**Mitigation**:
- Use find/replace with careful review
- Update TypeScript path aliases
- Use IDE refactoring tools

### Risk 3: Build Script Dependencies
**Mitigation**:
- Document all build dependencies
- Test builds at each phase
- Keep backup of working state

### Risk 4: CI/CD Pipeline Breaks
**Mitigation**:
- Update CI/CD gradually
- Test in feature branch first
- Keep old pipeline as backup

---

## 📝 Next Steps

1. **Review this plan** with the team
2. **Create feature branch** for migration
3. **Start with Phase 1** (infrastructure setup)
4. **Test incrementally** at each phase
5. **Update documentation** as you go
6. **Merge when complete** and tested

---

## 🔗 Resources

- [Turborepo Documentation](https://turbo.build/repo/docs)
- [pnpm Workspaces](https://pnpm.io/workspaces)
- [Monorepo Best Practices](https://monorepo.tools/)

---

**Status**: ✅ Completed
**Last Updated**: 2026-02-12
**Estimated Duration**: 8 days
**Priority**: High (Foundation for future scaling)

Migration executed per `.agents/task`. Root app remains runnable; `apps/web-app` is the migrated app using `@hashpass/*` packages; `apps/directus` holds SSO Docker setup; Terraform moved to `packages/infra/terraform`.
