Splash asset

- Location used by Expo/native: `app.json` now points to `./public/assets/splash.gif`.
- Web/PWA: `public/manifest.json` is the PWA manifest; Expo generates the web manifest from `app.json` at build time.
- If you want a separate PNG icon (`assets/images/splash-icon.png`) for native builds, place a PNG at that path.

To replace the splash GIF manually (if needed):

1. Save the new GIF as `public/assets/splash.gif` (overwrite existing).
2. If you need a native PNG, convert the GIF to PNG and place it at `assets/images/splash-icon.png`.
3. Rebuild the app: `expo build` / `expo start` (or your existing build steps).
