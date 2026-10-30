# BSL Colombia 2026 launch campaign

Campaign: **Antes de llegar, empieza a conectar.** Start with possibility, teach one useful action at a time, then help attendees arrive prepared.

The canonical copy and schedule live in `apps/mobile-app/config/marketing/bsl2026.json`. Spanish is the primary creative; English versions are included. All dates use America/Bogota (UTC−5). The event catalogue lists November 4–6, 2026, Bogotá, Universidad Externado, buildings H and I. Organizer changes remain authoritative.

| Send date (Bogotá) | Purpose | Primary action |
|---|---|---|
| Mon Oct 26, 09:00 | Anticipation / launch | Explore the event |
| Wed Oct 28, 09:00 | Agenda tutorial | Save/confirm useful sessions |
| Thu Oct 29, 18:30 | Personal attendance artwork | Create and share an “I’m attending” image |
| Fri Oct 30, 09:00 | Meetings tutorial | Send a considered meeting request |
| Mon Nov 2, 09:00 | Contacts tutorial | Create/share a card; accept a connection |
| Tue Nov 3, 09:00 | Activity and planned $LKS bonus | Understand test records and official announcements |
| Wed Nov 4, 07:00 | Arrival checklist | Check pass, agenda and accepted meetings |

Messages are drafts until the product links and assets are deployed and tested. The attendance artwork note is ready for an internal test; the global send still requires approval and the configured opt-in audience. The $LKS message additionally needs the responsible owner to confirm the announced terms. No tiers, allocation amounts, snapshot cutoff, TGE date, token price or claim contract have been invented. A prepared testnet snapshot is not an on-chain publication or token distribution.

Audience: registered users with a current newsletter opt-in. Suppression and unsubscribe are checked at queue time and immediately before sending. The admin shows queued, in-flight, provider-accepted, failed, uncertain and suppressed outcomes; provider acceptance is not confirmed inbox delivery. No fabricated open/click rates are shown.

Launch goals: successful agenda saves, meaningful requests/accepts, mutual contacts and returning users. Activity/bonus receipts are distinct from Network XP and wallet balances. Count unique users and action IDs; do not copy emails or private messages into analytics.

Deliverables: fourteen bilingual HTML/text email previews; a reusable brand/event-aware email renderer and preview command; five caption-led videos (teaser, agenda, meetings, contacts, activity); five social posters; step-by-step guides; a Plane project tree/importer; [GitHub tracking issue #424](https://github.com/hashpass-tech/hashpass.tech/issues/424); admin calendar and campaign delivery ledger. Rebuild all email previews with `node --import tsx campaigns/render-marketing-email.ts --config apps/mobile-app/config/marketing/bsl2026.json --all --out-dir campaigns/bsl-2026/emails`, or render only the attendance invitation with `--message bsl2026-attendance-invitation`. See `work-plan.json` for owners, dependencies, acceptance checks and dates, and `OPERATIONS.md` for activation and remaining prerequisites.
