# BSL Bogotá campaign

The campaign is defined in `bsl-bogota-campaign.json` and registered as three
Remotion compositions: `BslCampaign-welcome`, `BslCampaign-walkthrough`, and
`BslCampaign-recap`.

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
