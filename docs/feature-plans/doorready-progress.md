# DoorReady engineering progress

Tracking: [Meta AI Hackathon DoorReady MVP issue #455](https://github.com/hashpass-tech/hashpass.tech/issues/455).

## This PR: schema and deterministic domain foundation

- Adds versioned, user-scoped source document, evidence, extraction payload and Event Capsule types under `@hashpass/types`.
- Validates untrusted structured extraction output, rejects unknown fields/oversized responses, normalizes ISO timestamps and IANA zones, binds every fact to the authenticated source ID, and downgrades unsupported or uncited claims to uncertainty.
- Reconciles a source only into a caller-selected, already-authorized capsule. It does not search by event name or auto-merge independent documents. Conflicting venue/time claims remain pending review and preserve the old value and original artifact reference.
- Produces a deterministic, source-cited brief with an explicit `issuerUnverified` flag. It never creates or changes credential bytes.
- Includes 20 named synthetic extraction-shape fixtures plus security/reconciliation tests. These validate our decoder and policy only; they are not model accuracy evidence.

## Verified on 26 Oct 2026

- `pnpm --filter @hashpass/backend test`: 80 tests passed, including 20 DoorReady synthetic schema fixtures.
- `pnpm --filter @hashpass/backend build`, `pnpm --filter @hashpass/types build`, and `pnpm typecheck`: passed.
- Targeted ESLint for the changed DoorReady/Passport and type files: passed with no warnings after cleanup.
- `pnpm check:design-system` and `pnpm check:type-placement`: passed.
- Repository-wide `pnpm lint`: blocked by 9 existing errors in unrelated mobile files (`apps/mobile-app/app/(shared)/dashboard/admin.tsx`, `apps/mobile-app/app/events/[eventSlug]/networking/blocked.tsx`, `apps/mobile-app/app/events/[eventSlug]/networking/my-schedule.tsx`, `apps/mobile-app/components/CloudinaryDemo.tsx`, and `apps/mobile-app/components/LoyaltyDashboard.tsx`). It reports 246 existing warnings as well; none of the changed files are mobile UI files.
- No live Meta request was made. `MODEL_API_KEY` was absent from the environment and discovered non-example env-file key names. Repository Actions secret listing returned HTTP 403. A secure cloud secret requirement for `MODEL_API_KEY` was saved for `api.meta.ai`; the draft still needs user review/save and publication, then secure value entry. The actual API call, SDK/request shape, latency, token cost, credit consumption and model accuracy remain unverified.
- No production ticket, QR payload or attendee data was used. The API key and model provider are not implemented in this PR.
- No authenticated upload API, database/storage migration, event UI, offline browser cache, deployment or submission artifact is implemented or verified in this slice.

## Next P0 work

1. Supply `MODEL_API_KEY` through the secure environment setting. Confirm model availability and terms; issue #455 reports free-credit use may permit product improvement, so use synthetic fixtures only until the privacy terms are acceptable.
2. Make one bounded, sanitized synthetic smoke request to `muse-spark-1.3` and record real model ID, timestamp, latency and usage without prompt, key or raw output.
3. Implement the server-only Meta adapter from the verified official request/response contract, with schema validation and bounded retries.
4. Implement authenticated original upload, private storage, size/MIME/magic-byte checks, SHA256, user-isolated read/download/delete, then connect extraction and user-selected reconciliation.
5. Add the Expo/PWA capsule and offline original-artifact flow; run the 20 labeled accuracy fixtures through the real model and report field-level results. No deploy is authorized by issue #455.
