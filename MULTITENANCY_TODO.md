# Multi-tenancy State & Roadmap

## Current State (v1.0.0-tenant)
- [x] **Tenant Detection**: Hostname-based lookup implemented in `packages/config/src/sso-config.ts`.
- [x] **Dynamic Context**: `EventContext` in `apps/web-app` now uses the config layer to determine branding and metadata.
- [x] **Unified Routing**: Event pages moved to `apps/web-app/app/events/[eventSlug]`. Hardcoded `bsl2025` folder removed.
- [x] **Amplify Alignment**: `amplify.yml` simplified to use unified staging/production profiles instead of branch-specific logic.

## TODO List (The Multi-tenant Roadmap)

### Phase 1: Authentication & User Context
- [ ] **Tenant-Aware Redirects**: Ensure that after OAuth login, the `return_to` path preserves the tenant context (especially when using subdomains).
- [ ] **Cross-Tenant Cookies**: Research and implement cookie sharing (or isolation) across event subdomains (e.g., `event1.hashpass.tech` and `event2.hashpass.tech`).
- [ ] **Directus Role Mapping**: Configure Directus to automatically assign users to "Event Participant" roles based on the tenant they signed up through.

### Phase 2: Dynamic Content Rendering
- [ ] **Content Fetching**: Refactor `[eventSlug]` pages to fetch *all* details (Agenda, Speakers, Info) from Directus using the slug as a filter, instead of relying on the local `config/events.ts`.
- [ ] **Theme Injection**: Dynamically inject CSS variables (colors, fonts) into the root view based on the tenant's theme configuration in Directus.

### Phase 3: Infrastructure Scaling
- [ ] **Wildcard Domains**: Configure AWS Amplify for wildcard domain hosting so new events don't require manual domain setup in the console.
- [ ] **Tenant Provisioning Script**: Create a CLI tool to bootstrap a new event in Directus/AWS in one command.

### Phase 4: Polish & Performance
- [ ] **Edge Caching**: Implement per-tenant caching strategies at the AWS level.
- [ ] **SSO Handshake Optimization**: Reduce the number of redirects during the initial tenant detection phase.
