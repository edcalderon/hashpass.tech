# Storybook contribution guide

The catalog is at **Design System / Foundations and Controls**. Stories import
`packages/ui/src/system/primitives.tsx`; they are not visual replicas. Both local
and production builds include the shared component catalog and the existing guides.

Run `pnpm exec storybook dev -p 6006` locally. Validate with
`pnpm exec storybook build -o /tmp/hashpass-storybook` and `pnpm check:design-system`.
Use the direct command: the older root `build:storybook` fallback must not turn a
build failure into a reported success.

Every shared change includes:

1. All supported variants, light/dark themes and semantic roles.
2. Default, hover/focus, pressed, selected, disabled, loading and error states.
3. Phone width (320–390px), tablet and desktop; long labels and translated text.
4. Accessibility names/roles, keyboard behavior and reduced-motion examples.
5. A behavior test when interaction/authorization changes; contrast checks for
   changed palette pairs. Do not add tests that merely restate CSS values.

Primitives must be independent of app auth, event, router and theme providers.
Pass `mode` explicitly in stories and from the app's `useTheme` at call sites.
Use synthetic, explicitly illustrative data only in stories; never live account
identifiers, wallet seeds, cookies, auth tokens or environment values.
