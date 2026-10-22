# Campaign activation and follow-up

Tracking: https://github.com/hashpass-tech/hashpass.tech/issues/424. Planned launch: Monday October 26, 2026, 09:00 America/Bogota. Six scheduled touches continue through November 4. A scheduled time is a not-before time; bounded dispatch and provider limits can spread a large audience over subsequent batches.

## Prerequisites and activation

1. Apply `contacts-network` before `marketing-campaigns` using the existing tenant migration runner. Preview with `pnpm db:migrate -- --profile core-development --groups contacts-network,marketing-campaigns --dry-run`. Validate in development first. Production uses its existing backup and migration procedure; this change does not run production migrations.
2. Configure the existing updates SMTP sender and its credentials in the API runtime. Use the same random secret of at least 32 characters as `MARKETING_RUNNER_TOKEN` in the API runtime and GitHub Actions secret. Never place it in client variables. The dispatcher uses the existing API, without provisioning cloud resources.
3. Publish the campaign assets at `/campaigns/bsl-2026/` through the regular web release. Verify each guide, MP4, poster and product destination with a public browser. The generated source assets do not establish that the production URLs are already live.
4. In Dashboard → Admin → Emails, global admins can load the BSL drafts, review Spanish/English copy, edit dates and mark the concrete prerequisites checked. Loading drafts is idempotent and never replaces existing edits. Future campaigns can be created with their own keys, event IDs and approved HTTPS destinations.
5. Preview messages and verify the real configured sender with an authorized internal subscribed test account in development. Confirm audience count, opt-out, account/email changes, pause and uncertainty handling before activating production. Set repository variable `MARKETING_DISPATCH_ENABLED=true` after the production API, database, credentials and mailbox limits are verified. Then schedule the launch campaign and the subsequent verified messages. Keep the $LKS message in draft until its copy accurately reflects the announced program terms.

The worker checks current consent immediately before SMTP. A send that has already entered SMTP cannot be recalled by pausing. A lease lost after submission becomes `unknown`, never an automatic replay. `accepted` means SMTP acceptance, not inbox delivery. To reconcile, match the stable message ID `<marketing-DELIVERY_UUID@hashpass.tech>` in provider logs. Do not retry unknown recipients until evidence establishes that no message was accepted; a reviewed repair must preserve the audit trail. Provider bounce/complaint webhook integration and automatic reconciliation are follow-up work; no fabricated delivery/open/click metrics are shown.

The workflow currently processes up to 24 recipients per five-minute invocation (at most 288/hour). Confirm this capacity against the eligible audience and SMTP account limits before increasing it. GitHub schedules can run late. A punctual or larger launch should use the same authenticated endpoint with the organization's reliable scheduler; do not promise exact inbox timing.

## Activity and $LKS

The owner brief is an exclusive future $LKS TGE bonus for Hashpass users, with tier details to be announced. This implementation records unique server-confirmed account registrations, agenda favorites/confirmations, meeting requests/acceptances, interests and mutual Contacts edges. Repeated toggles or request replays do not earn duplicate points for the same source action. Only new activity after migration installation is captured; no historical activity is invented. Other interaction types require a stable source ID and a verified server hook before joining the award taxonomy.

Authenticated navigation observations exclude sensitive routes and query strings. They count separately and award zero verified points because a browser request cannot prove an eligible action. They do not fulfill a promise to reward every possible interaction. Expand the taxonomy with the rewards owner before making that universal public claim. Contacts Network XP is separate from this ledger.

The admin prepares a cutoff-bound manifest of verified activity with a deterministic SHA-256 digest. The manifest is stored privately; the admin sees metadata and user counts. Snapshot status is explicitly **testnet / unpublished**. No network, contract, transaction, eligibility cutoff, token allocation or claim process is invented. Chain publication needs the actual testnet, contract and signer configuration as follow-up.

## Plane project import

`node campaigns/bsl-2026/import-plane.mjs` validates the parent/child tree without remote writes. Securely supply `PLANE_API_KEY` and, if necessary, `PLANE_WORKSPACE_SLUG`, then run the same command with `--apply`. It authenticates before project creation, reconciles project identifier `BSL26`, and uses durable issue markers to resume interrupted imports without duplicates. The output records real project and issue URLs in `plane-import-result.json` only after success. Existing content is not overwritten.

Owner roles and dates are in `work-plan.json`; assign real people in Plane after import. Follow-ups: product QA and asset publication by October 25; campaign activation by October 25; monitor every send and reconcile failures; confirm official reward terms before the November 3 message; verify organizer updates for November 4; report engagement and close follow-ups November 6.

## Rebuild creative

Run `pnpm exec tsx campaigns/bsl-2026/build-assets.ts` from the repository root. Render each `videos/<name>` composition with pinned `hyperframes@0.8.185`, 24 fps, and output to `apps/mobile-app/public/campaigns/bsl-2026/<name>.mp4`. Export each `poster.html` at 1080×1350 to `<name>-poster.png`. Spanish caption files are provided alongside each composition. These are animated instructional cards, not recordings of private user accounts.
