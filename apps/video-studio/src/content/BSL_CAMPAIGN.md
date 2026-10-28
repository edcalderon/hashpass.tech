# BSL Bogotá campaign

The campaign is defined in `bsl-bogota-campaign.json`. The three banner films
remain `BslCampaign-welcome`, `BslCampaign-walkthrough`, and
`BslCampaign-recap`; `BslCampaign-welcome-en` is the English-localised
welcome cut. The web player selects that alternate for English browser
preferences and exposes English and Spanish WebVTT caption tracks.

Run the manual `BSL Bogotá initial campaign publish` workflow on `main` before
the event to render and publish the welcome and walkthrough films. The scheduled
`BSL Bogotá closing recap` workflow captures the 17:30 Bogotá metrics snapshot,
renders the 90-second recap, and replaces the manifest at 18:00.

The editorial source is the official [BSL Colombia 2026 page](https://blockchainsummit.la/colombia2026/), checked on 2026-10-28: November 4–6 in Bogotá at Universidad Externado, with sessions on regulation, payments, capital markets, stablecoins, tokenization, and digital infrastructure. The welcome cut highlights the supplied featured panel, **El sistema financiero en transformación: infraestructura, innovación y nuevos modelos institucionales**, on Wednesday 4 from 12:50 to 13:40, with Luis Botello, Jaime Rincón, Sandra Meza Cuervo, Juan Sebastián Peredo, and Nicolás Molina.

The Spanish welcome uses the Colombian feminine `es-CO-SalomeNeural` voice;
the English welcome uses the male `en-US-GuyNeural` voice. Generate the two
reviewable narration tracks and timed WebVTT captions with:

```bash
pnpm --filter hashpass-video-studio bsl:welcome:narration
```

Both cuts use the licensed studio bed, an official high-contrast Colombia
lockup, a verified HASHPASS wordmark, staged panel speaker cards, and scene
transitions. Review the generated audio and render before publication.
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
