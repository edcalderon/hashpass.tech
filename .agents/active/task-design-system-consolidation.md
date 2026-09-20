# Unified design system and guest event discovery

Priority: high. Status: implementing and validating; not released.

## Accepted scope

Use one reusable design system across web/native, preserving the HASHPASS identity
and supplied reference. The canonical public `/dashboard/explore` route reuses the in-app Explorer and its search,
filters, layouts and pagination. Guest account actions open a registration dialog
in place. Include this work with the Node baseline and wallet foundation in the
next protected **patch** release. Do not claim pending wallet signing is shipped.

## Progress

- [x] Install official Impeccable 4.3.1 skill for Codex; no third-party hooks enabled.
- [x] Define shared semantic tokens and Surface, Badge, ActionButton, FilterChip,
  FormField primitives in packages/ui.
- [x] Align shared theme geometry/palette, landing reference cards, section badges,
  newsletter actions, wallet onboarding and Explorer radii.
- [x] Add desktop scroll/illustration motion, native lightweight fallbacks and
  reduced-motion behavior. Compact benefit cards follow the main CTA.
- [x] Document DESIGN.md, PRODUCT.md, Storybook guidance, AGENTS.md and CLAUDE.md.
- [x] Add production-component Storybook stories and a CI guard preventing new
  literal style debt. Inventory retains legacy files for incremental migration.
- [x] Fix public-route startup provider dependency and omitted-filter crash;
  regression test permits filterPublicEvents(events) safely.
- [x] Reuse actual Explorer in public guest shell with real event-media showcase.
- [x] Make `/dashboard/explore?eventId=...` public; `/events` redirects there.
  Root/dashboard guards expose only Explorer; private screens remain protected.
  Final guest header contains only shared quick settings and Join. Redundant QR,
  notification and profile icons were removed at user request; private sidebar
  and event actions still open the auth dialog.
- [x] Gate bookmarks, rooms, passes and private navigation with embedded existing
  OTP auth; preserve search and retain the canonical Explorer route and eventId after authentication.
- [x] Test guest actions, public navigation, actual form OTP completion with mocked
  service responses, catalogue ordering and manual showcase controls.
- [ ] Finish combined responsive browser review and full current validation.
- [ ] Prepare protected patch promotion PR; verify >=69% patch coverage and scans.
- [ ] Obtain owner approval, merge, and verify automatic release/deployment flows.

## Limits and follow-up

No simulated account or fabricated wallet/event data. Browser QA does not send
real authentication emails. Native device verification remains pending. Existing
style debt is tracked, not declared eliminated. Signing, external MetaMask recovery
checks and Ledger integration remain in the wallet task; production wallet setup
stays disabled. Database migration is not applied to a production database.

Validation checkpoint: 229 suites / 1,384 tests passed before the canonical-route
steering. Canonical-route and guard tests are being rerun. Storybook build, frozen
install, style guard and typecheck passed. Local instrumented patch coverage was
86.6%; the final GitHub check is still required. No release has been prepared yet.

Latest refinement: shared QuickSettingsPanel is available inline without login,
including persisted appearance/language/animation preferences. Verified Spanish
and light/dark switching in browser. Auth dialog now uses shared ModalBackdrop
(blue translucent scrim, web blur, native keyboard-safe tint) and a compact form.
Added IconButton and exact account SVG mappings to the reusable system; guest
header intentionally omits redundant account controls. Native device QA pending.

Header and locale checkpoint: shared icon + HASHPASS wordmark replaces the plain
text header. Settings precedes Join, with the shared login icon inside the button.
The button keeps icon and label together; long translated labels wrap within the
label on narrow screens. Verified at 390px with French text and the centered
mobile settings panel. Landing cards and testimonials now follow all six locales.
Latest complete app run: 231 suites / 1,403 tests passed; subsequent header,
settings and design-system checks: 3 suites / 19 tests passed. Native device QA
and release promotion remain pending.

Release checkpoint: Guest mode badge now explains the simplified public experience
and invites registration and app download in all six locales. Tooltip responds to
focus, hover and press, with blur/pointer-leave/Escape dismissal on web. Latest
focused guest/locale run: 19 tests passed; changed TypeScript, design-system guard,
secret scan and production Storybook build passed. Preparing the patch promotion
PR; owner approval, CI patch coverage and deployment verification remain pending.
