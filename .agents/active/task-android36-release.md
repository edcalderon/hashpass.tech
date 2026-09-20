# Android 16 target and complete Play release

Priority: P0. Status: active.

User authorized internal → alpha → beta → production. v1.9.41 web and both API
version endpoints are verified live. Internal Android run 35501941867 compiled
but Google Play rejected its API 35 artifact. No alpha/beta/production for that
version. Existing tags must not move.

- [x] Diagnose Play rejection; confirm current API 36 policy.
- [x] Configure Expo prebuild compile and target API 36.
- [x] Validate generated Gradle properties with Expo introspection regression.
- [ ] Prepare protected v1.9.42 patch PR and pass checks/approval.
- [ ] Merge and verify internal, automatic alpha and beta.
- [ ] Dispatch fresh production build with production environment after beta.
- [ ] Verify web/API versions, Play workflow results and remote synchronization.

No production wallet creation or migration has been enabled by this task.
Physical Android 16 runtime verification remains pending.
