# HASHPASS design system

## Visual direction

A calm, minimal event platform: clear typography, neutral surfaces, cyan actions,
quiet borders, and real organizer media. Preserve the existing light/dark modes,
brand logos, and the reference's spacious illustration panels. Event brand colors
belong to event artwork; they do not redefine app controls.

## Source of truth

- Tokens: `packages/ui/src/system/tokens.ts` (`@hashpass/ui/tokens`).
- Production primitives: `packages/ui/src/system/primitives.tsx`
  (`@hashpass/ui/primitives`). These work on React Native and React Native Web.
- Catalog: `packages/ui/src/system/System.stories.tsx`. Storybook must import
  production components, never copies made only for documentation.
- Existing `useTheme` consumers receive the same semantic palette through
  `apps/mobile-app/lib/theme.ts`. The club is a color skin using shared geometry.

## Component contract

| Role | Geometry | Usage |
| --- | --- | --- |
| Surface / card | 24px corners, 1px border, 24px padding | Related information; no nested card decoration |
| Media panel | 16px corners | Illustration, photo or video inside a surface |
| Form field | 12px corners, minimum 48px height | Persistent label, error text, accessible name |
| Action button | Pill, minimum 48px height | Primary filled cyan; secondary tinted; ghost transparent |
| Filter chip | Pill, minimum 44px height | Selected state exposed to assistive technology |
| Badge | Pill, minimum 32px height, 12px semibold | Non-interactive status/section label; never looks like a button |
| Circular artwork | Circle token or intrinsic geometry | Avatars, logos, progress graphics; not card corners |

Use `Surface`, `Badge`, `ActionButton`, `FilterChip`, and `FormField`, `IconButton` and `ModalBackdrop` for their
respective roles. Do not invent variants in individual screens. Extend a shared
primitive when the same intent appears in three places. Static labels and actions
share a silhouette but differ in height, semantics and interaction.

Account/header tools use `IconButton` with a concrete `NativeSafeIcon` SVG mapping:
QR (`qr-code`), notifications (`notifications`), profile (`person`). Never rely on
an unknown-name fallback. Icon-only actions require a translated accessible label.
Modals use the semantic translucent blue overlay and shared blur token on web;
native uses the same tint without expensive blur. Keep dialog content opaque for
contrast, keyboard-safe and scrollable. Embedded auth omits full-page headers,
version badges and nested card decoration.

## Color, type and spacing

Use semantic canvas, surface, raised, border, text, muted, accent, accentFill,
onAccent, danger and success tokens. Body and action text must meet 4.5:1 contrast.
Use muted text on neutral surfaces, not low-opacity text over video. Media-backed
badges use the `onMedia` variant. Reserve red for errors/destructive actions;
existing red brand marks are exempt.

Spacing follows 4/8/12/16/24/32/48/64. Use the existing application fonts and token
sizes: 12 caption, 14 label, 16 body, 24 title, 32 heading, 40 display. Layout must
support long Spanish/Korean copy and system text scaling without fixed text heights.

## Motion and platform behavior

Web may use authored SVG/CSS detail animations and Motion viewport entrances.
Native uses lightweight Reanimated opacity/translation. Use token timing (160ms
feedback, 240ms transitions, 520ms entrance, 70ms stagger). Stop loops outside the
viewport and on background. Respect both app animation settings and system reduced
motion. Disabled/reduced motion must keep content visible. Never hide essential
content until a scroll callback arrives. Autoplay media requires pause controls;
manual slider controls remain usable when autoplay is disabled.

## Responsive and accessible behavior

Use 3/2/1 columns for wide/tablet/phone content where appropriate; never shrink
body copy to force a desktop row onto a phone. Intentional chip/carousel scrolling
must stay inside its region. Maintain touch targets, safe areas, visible keyboard
focus, selected/busy/disabled state, and clear empty/error/loading states. Use real
images/videos with a neutral fallback; do not invent events or wallet balances.

## Governance and validation

Run `pnpm check:design-system`, changed-file typechecking, relevant behavior tests,
and the Storybook build. Inspect one combined desktop/mobile light/dark pass,
fix confirmed defects together, then one confirmation pass. Test native behavior
with component tests and on devices before claiming device verification.

`packages/ui/design-debt.json` records existing literal styles across the app.
The guard rejects new/increased occurrences rather than pretending all legacy
screens have already been migrated. Do not regenerate that baseline to silence a
failure: migrate to tokens, or document an organizer-artwork/platform exception
and review the exact baseline adjustment. Existing debt is a migration inventory,
not permission to copy a legacy style into new code.

## Impeccable

The Impeccable skill is installed for Codex from `pbakaus/impeccable`, version 4.3.1.
Use its extract/audit/polish guidance with this project's reference and product
constraints. The pinned visual brief takes precedence over generic taste rules.
No automatic third-party edit hooks are enabled by this change. Maintainers can
install the skill for their own harness using the upstream installation guide.
