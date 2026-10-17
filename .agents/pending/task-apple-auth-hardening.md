# Task: Apple Auth Hardening and Weekly Regression Matrix

**Status:** 🕒 PENDING
**Priority:** 🟢 Low (production Apple sign-in is working; follow-up only)
**Created:** 2026-10-17
**Related release:** `v1.9.119` / PR #385

## Goal

Keep the verified production Apple sign-in flow stable while gradually adding
coverage for the failure modes that are difficult to reproduce in a local
browser. This task is intentionally non-blocking and should be scheduled as a
future hardening pass, not mixed into unrelated auth changes.

## Current production contract

- iOS Safari/mobile browser uses Better Auth web OAuth and returns through
  `https://api.hashpass.tech/api/auth/callback/apple`.
- Apple posts `application/x-www-form-urlencoded` data with
  `response_mode=form_post`.
- The Lambda adapter preserves API Gateway v2 cookies and decodes base64
  bodies as bytes.
- The Apple route allow-lists callback fields before handing Better Auth the
  equivalent GET callback.
- Native iOS uses the identity-token exchange and remains a separate flow.

## Follow-up acceptance criteria

- [ ] Add a deterministic integration test for a complete Apple form-post
  through an API Gateway v2-shaped event, including the state cookie and a
  base64-encoded body.
- [ ] Add a weekly/manual iOS Safari matrix: first-time consent, repeat sign-in,
  Hide My Email, cancellation, expired state, private browsing, interrupted
  network, and sign-out followed by sign-in.
- [ ] Add a signed native iOS matrix: first-time account, repeat account,
  revoked Apple authorization, cancelled sheet, missing network, and native
  token audience mismatch.
- [ ] Verify both production and development Apple return URLs after any Apple
  Developer portal change, without copying secrets into tickets or screenshots.
- [ ] Add a redacted callback diagnostic that proves the flow reaches code
  exchange without printing `code`, `state`, cookies, `user`, ID tokens, or
  client-secret JWTs.
- [ ] Confirm the API logs distinguish expected invalid-code diagnostics from
  real `state_not_found`, redirect mismatch, and provider-configuration errors.
- [ ] Review Better Auth and Expo/Auth dependencies during the normal dependency
  update cycle; rerun the auth regression suite before upgrading either one.

## Guardrails for future auth changes

1. Do not change the Apple Services ID, callback URLs, cookie attributes, or
   API Gateway body handling in the same change as an unrelated auth refactor.
2. Keep `apps/docs/docs/auth/SIGN_IN_WITH_APPLE.md` and this task synchronized
   when the provider, portal configuration, or callback contract changes.
3. Require the focused route/Lambda tests, CodeQL, secret scanning, and patch
   coverage before merging.
4. Re-run the real iOS Safari smoke test after any change to Better Auth,
   `better-auth-route.ts`, the Lambda adapter, cookie handling, or redirect
   construction.

## References

- [Sign in with Apple production setup](../../apps/docs/docs/auth/SIGN_IN_WITH_APPLE.md)
- [Apple auth flow overview](../../apps/docs/docs/auth/AUTH_FLOW.md)
- [PR #385](https://github.com/hashpass-tech/hashpass.tech/pull/385)
