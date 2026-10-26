# Web camera permissions

The web scanners' camera access goes through `lib/camera-permissions.ts` with
browser detection and probing helpers in `lib/web-camera-support.ts`.

## Flow

1. Opening a scanner checks status through the Permissions API only — it never
   calls `getUserMedia` before a button click, because browsers require the
   prompt to come from a user gesture.
2. "Grant Permission" runs one `getUserMedia` from the click. An
   `OverconstrainedError` retries once with bare `{ video: true }` (some Firefox
   and driver combinations reject the ideal-facing-mode profile). If
   `enumerateDevices` conclusively shows no camera, the prompt is skipped and
   the user is told to connect one; Firefox hides the device list before the
   first grant, so an empty list stays inconclusive.
3. While the permission screen is visible, both scanners subscribe to the
   browser's own signals (`watchWebPermission`): the Permissions API state and
   `devicechange`. Enabling the camera from the address bar resumes scanning
   without a page reload on Chrome, Edge and Firefox 125+; Safari supports
   neither and simply never fires the watcher.

## Browser handling

- `detectWebBrowser` recognizes Chrome, Edge, Samsung Internet, Firefox,
  Safari and the iOS variants (CriOS/FxiOS). Every iOS browser uses WebKit's
  sheet and Safari's Settings flow, so iOS instructions describe Safari's
  menus regardless of vendor.
- Firefox denies are surfaced as "denied or dismissed" with the address-bar
  fix; a session grant is remembered for browsers whose Permissions API cannot
  report camera state (Safari), and forgotten as soon as the browser reports
  the camera blocked.
- The permission screen only shows "Grant Permission" while asking again is
  possible; once blocked, the instructions action takes over.

Tests: `tests/lib/camera-permissions.test.ts` and
`tests/lib/web-camera-support.test.ts`.
