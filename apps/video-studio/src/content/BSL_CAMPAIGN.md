# BSL Bogotá campaign

The campaign is defined in `bsl-bogota-campaign.json` and registered as three
Remotion compositions: `BslCampaign-welcome`, `BslCampaign-walkthrough`, and
`BslCampaign-recap`.

Run the manual `BSL Bogotá initial campaign publish` workflow on `main` before
the event to render and publish the welcome and walkthrough films. The scheduled
`BSL Bogotá closing recap` workflow captures the 17:30 Bogotá metrics snapshot,
renders the 90-second recap, and replaces the manifest at 18:00.

The editorial source is the official [BSL Colombia 2026 page](https://blockchainsummit.la/colombia2026/), checked on 2026-10-27: November 4–6, Bogotá, Universidad Externado, with themes covering regulation, payments, capital markets, stablecoins, tokenization, and digital infrastructure. Speaker names used by the welcome script are Ana María Prieto, Juan Pablo Córdoba, and Nagel Paulino, as listed on that page. The script does not infer speaker-to-session assignments.

Narration is Spanish and the caption track is English. The render uses the
existing licensed studio audio bed and BSL recordings as a local fallback;
production narration assets must be generated and reviewed before publication.
The recap metrics use a repeatable-read, event-scoped query with a fixed
17:30 America/Bogota cutoff. It counts new pass-holding accounts, meeting
requests, event and meeting-chat messages, and verified agenda actions. It
never exports message content, ciphertext, email addresses, or user IDs.

The app fetches a same-origin HTTPS manifest and validates event identity,
allowed media paths, and durations before showing the films. Before closing,
the welcome and walkthrough are available as additional slides. At exactly
18:00 America/Bogota, the client selects the recap. A failed manifest fetch
keeps the existing event hero available.

Local web development never derives the manifest URL from the production S3
hero URL. It probes the same-origin fixture path instead, and native development
skips campaign discovery until a local media endpoint is explicitly configured
with `EXPO_PUBLIC_EVENT_VIDEO_MANIFEST_URL`. Production S3 must use the reviewed
read-only policy in `docs/event-media-cors-policy.json` so browsers can fetch
the manifest and media from the approved HashPass origins.
