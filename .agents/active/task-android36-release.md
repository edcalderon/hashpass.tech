# Android 16 target and complete Play release

Priority: P0. Status: active.

User authorized internal → alpha → beta → production. v1.9.41 web and both API
version endpoints are verified live. Internal Android run 35501941867 compiled
but Google Play rejected its API 35 artifact. No alpha/beta/production for that
version. Existing tags must not move.

- [x] Diagnose Play rejection; confirm current API 36 policy.
- [x] Configure Expo prebuild compile and target API 36.
- [x] Validate generated Gradle properties with Expo introspection regression.
- [x] Prepare protected v1.9.42 patch PR (#246).
- [ ] Add the approved landing responsiveness refinement and pass checks/approval.
- [ ] Merge and verify internal, automatic alpha and beta.
- [ ] Dispatch fresh production build with production environment after beta.
- [ ] Verify web/API versions, Play workflow results and remote synchronization.

No production wallet creation or migration has been enabled by this task.
Physical Android 16 runtime verification remains pending.

Landing refinement checkpoint: the phone feature carousel was replaced by a
single-column responsive grid, How-it-works illustrations now animate related
objects, and the rewards scene uses the LUKAS diamond with `$LKS`, `+5`, and
`+10`. Mobile viewport rules preserve browser zoom while preventing horizontal
page drift and input-focus zoom. Focused tests and 390px/1440px browser checks
pass. These changes still need a commit, PR #246 CI, and owner approval.
