# BSL campaign verification

Local checks completed October 22, 2026:

- 96 tests passed across nine suites: campaign validation/rendering, admin API/authorization, worker outcomes, editor/calendar/snapshot behavior, session-isolated data hook, SMTP sender, existing event communications, pass-code admin and Contacts regression tests.
- Focused campaign coverage: 98.44% lines, 95.39% statements, 89.34% branches. This measures the panel, data hook, campaign helpers and API/worker services; it is not the hosted release PR patch-coverage result.
- 30 PostgreSQL assertions passed using isolated PGlite 0.3.14 with the actual Contacts and marketing migrations: consent exclusions, one outbox entry per campaign/recipient, immutable copy after queueing, claim tokens, pause/resume, duplicate acknowledgements, activity trigger deduplication, snapshot integrity/idempotence and denied authenticated-role access.
- Changed-file typechecking, legal-content check, design-system guard, type-placement guard and migration dry-run passed. Migration order: V127, V132, V133.
- Production Storybook built. Browser QA at 1440px and 390px, light/dark: no runtime errors or horizontal page overflow; exercised calendar, bilingual editor, delivery history and cutoff input.
- Email previews checked at 390px and 900px in ES/EN. Public image URLs were mapped to local generated assets for this check; production asset availability is still a release prerequisite. No overflow or broken local images. Guide page contains five accessible controlled videos and text instructions.
- All five HyperFrames compositions passed runtime/layout/motion/contrast checks. Output verified with ffprobe: 1080×1920, 24 fps, 18 seconds each. Five 1080×1350 posters have no text overflow. The videos are caption-led and silent; they are animated instructional guides, not private-account screen recordings.
- Plane importer dry-run validated 26 parent-ordered nodes. GitHub #424 has real activation, Plane and rewards follow-ups (#427–#429).

Not performed: authenticated hosted/native-device QA, real recipient sends, production database migration, production asset publication, activation of live schedules, Plane writes or blockchain transactions. This workspace has no Plane key, database connection or runner secret. The configured production SMTP sender must be verified in the deployed environment. No real audience/delivery counts or token balances have been invented.

Follow `OPERATIONS.md` and the linked activation issues for the remaining work. The existing draft release PR must still satisfy repository review, current-head CI/security and hosted patch-coverage requirements before release.
