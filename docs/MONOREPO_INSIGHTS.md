# Monorepo Migration: Key Insights & Recommendations

## 🔍 Current State Analysis

### What's Working Well ✅

1. **Clear Separation of Concerns** (in code, not structure)
   - Auth providers are well abstracted (`lib/auth/providers/`)
   - Backend providers follow interface pattern (`lib/backend/interfaces.ts`)
   - Configuration is centralized (`config/`)

2. **Modern Tech Stack**
   - Expo Router for routing
   - TypeScript throughout
   - React 19 + React Native
   - Good use of hooks and context

3. **Infrastructure as Code**
   - Terraform for GCP
   - Docker Compose for Directus
   - Database migrations with Flyway

### Critical Issues 🚨

1. **No Package Boundaries**
   - Everything imports from root-level `lib/`, `components/`, `hooks/`
   - Hard to know what's shared vs app-specific
   - Changes to shared code can break everything

2. **Directus Not Isolated**
   - Docker setup in `deploy/` but not as a package
   - Hard to version and test independently
   - Should be `apps/directus` for local dev

3. **Build Script Complexity**
   - Build scripts scattered across root
   - Hard to understand build dependencies
   - No clear build pipeline

4. **Type Safety Issues**
   - Types in `types/` but also inline in `lib/`
   - No clear type package boundaries
   - Hard to share types across packages

---

## 💡 Key Recommendations

### 1. **Start with Core Packages** (Highest Impact)

**Priority Order:**
1. `@hashpass/auth` - Most critical, used everywhere
2. `@hashpass/types` - Foundation for type safety
3. `@hashpass/config` - Centralized configuration
4. `@hashpass/backend` - Backend abstractions
5. `@hashpass/ui` - Shared components (can be incremental)

**Why this order?**
- Auth is the most shared code
- Types enable better IDE support
- Config is simple to extract
- Backend is well abstracted already
- UI can be migrated incrementally

### 2. **Keep Directus Simple**

**Recommendation**: `apps/directus` should be minimal:
- Just Docker Compose + env files
- No TypeScript/JavaScript code
- Documentation only
- Used for local testing only

**Why?**
- Directus is a service, not code you write
- Keep it separate from your application code
- Makes it clear it's infrastructure, not a package

### 3. **Incremental Migration Strategy**

**Don't migrate everything at once!**

**Phase 1**: Extract `@hashpass/auth` first
- Most critical package
- Clear boundaries
- Test thoroughly before moving on

**Phase 2**: Extract `@hashpass/types` + `@hashpass/config`
- Foundation for other packages
- Low risk, high value

**Phase 3**: Extract `@hashpass/backend`
- Well abstracted already
- Clear interfaces

**Phase 4**: Migrate web-app structure
- Move app to `apps/web-app`
- Update imports incrementally

**Phase 5**: Extract UI components (optional, can be later)
- Some components are app-specific
- Can migrate shared ones incrementally

### 4. **Package Naming Convention**

**Use scoped packages**: `@hashpass/*`

**Benefits:**
- Clear ownership
- Prevents naming conflicts
- Can publish to npm later if needed
- Better IDE support

**Examples:**
- `@hashpass/auth`
- `@hashpass/ui`
- `@hashpass/config`
- `@hashpass/types`
- `@hashpass/utils`
- `@hashpass/backend`

### 5. **Turborepo Configuration**

**Key Pipeline Tasks:**
```json
{
  "build": {
    "dependsOn": ["^build"],  // Build dependencies first
    "outputs": ["dist/**"]
  },
  "dev": {
    "cache": false,           // Don't cache dev mode
    "persistent": true        // Keep running
  },
  "lint": {
    "dependsOn": ["^lint"]   // Lint dependencies first
  }
}
```

**Why this matters:**
- Ensures correct build order
- Caches builds for speed
- Parallel execution where possible

### 6. **Path Aliases Strategy**

**Current (root-level):**
```json
{
  "@/*": ["./*"],
  "@lib/*": ["./lib/*"],
  "@components/*": ["./components/*"]
}
```

**New (package-level):**
```json
// In apps/web-app/tsconfig.json
{
  "compilerOptions": {
    "paths": {
      "@hashpass/auth": ["../../packages/auth/src"],
      "@hashpass/ui": ["../../packages/ui/src"],
      "@hashpass/config": ["../../packages/config/src"]
    }
  }
}
```

**Benefits:**
- Clear package boundaries
- Better IDE autocomplete
- Easier refactoring
- Type-safe imports

### 7. **Shared vs App-Specific Code**

**Guideline**: If it's used in multiple places → Package. If it's app-specific → Keep in app.

**Examples:**

**Should be packages:**
- ✅ `lib/auth/*` - Used everywhere
- ✅ `lib/backend/*` - Backend abstractions
- ✅ `config/*` - Shared configuration
- ✅ `types/*` - Shared types
- ✅ `components/ui/*` - Base UI components

**Should stay in app:**
- ✅ `app/*` - Routes and pages
- ✅ `components/EventBanner.tsx` - App-specific component
- ✅ `hooks/useChatScroll.ts` - App-specific hook
- ✅ App-specific business logic

### 8. **Testing Strategy**

**Per-Package Testing:**
- Each package should have its own tests
- Test packages in isolation
- Integration tests in apps

**Example Structure:**
```
packages/auth/
├── src/
├── __tests__/
│   ├── providers.test.ts
│   └── hooks.test.ts
└── package.json
```

### 9. **Documentation Strategy**

**Per-Package README:**
- Each package should have a README
- Document exports
- Document usage examples
- Document dependencies

**Root README:**
- Overview of monorepo
- Getting started guide
- Links to package docs

### 10. **CI/CD Considerations**

**Turborepo Benefits:**
- Only build what changed
- Parallel execution
- Caching for speed

**Recommended Workflow:**
1. Lint all packages
2. Build changed packages + dependents
3. Test changed packages
4. Deploy affected apps

---

## 🎯 Success Metrics

### Before Migration:
- ❌ Hard to add new apps
- ❌ Shared code changes affect everything
- ❌ No clear dependency graph
- ❌ Build times: ~5-10 minutes

### After Migration:
- ✅ Easy to add new apps
- ✅ Clear package boundaries
- ✅ Visual dependency graph
- ✅ Build times: ~1-2 minutes (with caching)

---

## 🚀 Quick Wins

### Week 1: Foundation
1. Set up Turborepo + pnpm
2. Extract `@hashpass/auth` package
3. Extract `@hashpass/types` package
4. Test builds and imports

### Week 2: Core Packages
1. Extract `@hashpass/config`
2. Extract `@hashpass/backend`
3. Migrate web-app structure
4. Update all imports

### Week 3: Polish
1. Extract shared UI components
2. Set up Directus app
3. Update CI/CD
4. Documentation

---

## ⚠️ Common Pitfalls to Avoid

1. **Don't over-package**
   - Not everything needs to be a package
   - Start with clear shared code
   - Add packages as needed

2. **Don't break existing functionality**
   - Migrate incrementally
   - Test at each step
   - Keep old structure until migration complete

3. **Don't ignore build times**
   - Use Turborepo caching
   - Optimize build scripts
   - Monitor build performance

4. **Don't skip documentation**
   - Document package exports
   - Document migration process
   - Update README files

---

## 📚 Additional Considerations

### Future Scalability

**Potential Future Apps:**
- `apps/mobile-app` - React Native mobile app
- `apps/admin-panel` - Admin dashboard
- `apps/docs` - Documentation site
- `apps/storybook` - Component library docs

**Potential Future Packages:**
- `@hashpass/api-client` - API client SDK
- `@hashpass/blockchain` - Blockchain utilities
- `@hashpass/email` - Email templates
- `@hashpass/i18n` - Internationalization

### Team Collaboration

**Benefits:**
- Clear ownership of packages
- Easier code reviews
- Better onboarding
- Parallel development

**Considerations:**
- Need to coordinate package changes
- Need clear versioning strategy
- Need good documentation

---

## 🎓 Learning Resources

- [Turborepo Handbook](https://turbo.build/repo/docs/handbook)
- [pnpm Workspaces Guide](https://pnpm.io/workspaces)
- [Monorepo Tools Comparison](https://monorepo.tools/)
- [TypeScript Project References](https://www.typescriptlang.org/docs/handbook/project-references.html)

---

**Next Action**: Review `MONOREPO_MIGRATION_PLAN.md` and start with Phase 1 (Infrastructure Setup)
