# SVG Assets Don't Render in React Native's `<Image>` on Native

## Summary

The BSL On Tour event hero banner, its "Explore All Events" list
thumbnails, and the dashboard carousel's logo slides all rendered
correctly on web but showed blank (just the surrounding solid-color
background, no logo/graphic) on native Android/iOS. Not a crash, no
error — the image simply never painted. Root cause: several BSL-only
image assets (`bsl-ontour-pro.svg`, `bsl-peru-pro.svg`,
`bsl-chile-pro.svg`, `bsl-colombia-pro.svg`,
`BSL-Logo-fondo-oscuro-2024.svg`, `bsl2025-hero.svg`) were `require()`'d
directly and passed straight into React Native's `<Image source={...}>`.

## Why this only broke on native

React Native's `Image` component is backed by the platform's native image
view (Android `ImageView` / iOS `UIImageView`), and neither platform's
built-in image decoder understands SVG — they only decode raster formats
(PNG, JPEG, WebP, GIF, BMP). On web, `react-native-web` maps `Image` to a
plain `<img>` DOM element, and every browser renders SVG natively via
`<img src="foo.svg">`. Same source code, same `require()`, genuinely
different rendering behavior per platform — no error surfaces on native
because passing an unsupported/undecodable URI to `Image` just fails to
paint, silently.

This project had already hit and fixed this exact class of bug once,
for the small HASHPASS wordmark logo — see
`apps/mobile-app/lib/hashpass-logo.ts`, which splits each logo into a
`_WEB` (`.svg`) and `_NATIVE` (`.webp`) variant, resolved via
`Platform.OS === "web"`. The BSL-only assets never got the same
treatment because no raster counterpart existed for them yet — the
`.svg` requires in `apps/mobile-app/lib/event-branding.ts` and
`apps/mobile-app/components/EventBannerCarousel.tsx` were simply the
only option available, and shipped anyway since nobody caught it on web
during review.

## The fix (2026-07-29)

Rasterized all six affected SVGs with `sharp` (already a repo
dependency; its `webp()`/`png()` output methods handle SVG input via
librsvg) at native resolution, alpha channel preserved:

```js
const sharp = require('sharp');
await sharp('assets/logos/bsl/bsl-ontour-pro.svg').webp({ lossless: true }).toFile('assets/logos/bsl/bsl-ontour-pro.webp');
await sharp('assets/logos/bsl/bsl-ontour-pro.svg').png().toFile('assets/logos/bsl/bsl-ontour-pro.png');
```

Repointed the `require()` calls in `event-branding.ts` and
`EventBannerCarousel.tsx`'s duplicate top-level consts to the new
`.webp` files. Unlike `hashpass-logo.ts`, no `_WEB`/`_NATIVE` platform
branch was introduced here — these consts are plain module-level values
consumed by several call sites (`resolveEventImageSource`,
`getTourBrandAsset`, `getLampBrandConfig`, `HASHPASS_BRAND_LOGOS`)
without any `isWeb` parameter in their signatures, and `.webp` renders
correctly on web too (just a marginally larger payload than an
equivalent `.svg`), so branching would have added complexity without a
real benefit here. Reserve the `_WEB`/`_NATIVE` split for cases where a
function already takes a platform-relevant parameter.

The `.svg` string keys in `EVENT_IMAGE_ASSETS` (e.g.
`'/assets/logos/bsl/bsl-ontour-pro.svg'`) were **not** changed — those
are lookup identifiers matched against whatever path string the event
data supplies, independent of which file the corresponding
`require()` actually resolves to.

Verified via a real `expo export --platform web` that the built bundle
resolves the new `.webp` assets (confirmed the hashed output filename
matches, e.g. `bsl-ontour-pro.8fc2f93c785298ed1a7ed070649b0939.webp`) —
the `.svg` strings still present in the bundle afterward are exactly
the unchanged `EVENT_IMAGE_ASSETS` lookup keys, not a sign the fix
didn't take.

## How to avoid this class of bug going forward

- **Never `require()` a raw `.svg` for a plain `<Image>` source.** Either
  rasterize it to `.webp`/`.png` first, or render it with
  `react-native-svg`'s `<SvgUri>`/`<SvgXml>` components instead (see
  `apps/mobile-app/components/explorer/ExplorerHeader.tsx`, which
  correctly uses `SvgUri` and was unaffected by this bug).
- A blank image region with no console error, present on native but
  correct on web, is the specific signature of this bug — check for a
  `.svg` `require()` feeding a plain `Image` before assuming it's a
  data/network/permission issue.
- Web-only review is not sufficient signal that an image asset works —
  this bug shipped because it looked fine in every web preview.
