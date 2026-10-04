<p align="center">
  <img src="./public/brand/localpass-logo.svg" width="360" alt="LocalPass">
</p>

<p align="center"><strong>Offline tourism intelligence for real-world destinations.</strong></p>

<!-- LOCALPASS_RELEASE:START -->
> **Current MVP release:** [v0.1.1](./CHANGELOG.md) · stable · 2026-10-04
<!-- LOCALPASS_RELEASE:END -->

LocalPass is a bilingual, offline-first tourism MVP for Guatapé, Colombia. It keeps practical destination guidance useful when connectivity is unreliable: the traveler downloads a compact local pack once, then searches, plans, switches language, and accesses essentials entirely on their device.

## Why it matters

Most travel and AI products assume stable connectivity, capable hardware, and digitally mature suppliers. LocalPass is designed around the conditions that make those assumptions fail. Its local planning engine works without an API after the pack and app shell are stored, while independent local operators remain discoverable without a marketplace account or continuous connection.

## MVP at a glance

| Capability | What judges can verify |
| --- | --- |
| Offline-first PWA | Download the Guatapé pack, reload in simulated or browser-offline mode, and continue planning. |
| Practical local planning | Enter a time limit, a COP budget, and terms such as `kayak`, `coffee`, or `Piedra del Peñol`. |
| Bilingual experience | Switch between English and Spanish across the plan, directory, and essential information. |
| Local economic inclusion | Local operators receive a transparent ranking boost and a visible support-local marker. |
| Trusted local data | The app uses a compact, inspectable destination pack instead of invented listings or cloud-generated results. |

The current pack contains 14 places and experiences, including 9 local-operator demo entries. It is a demonstrated Guatapé pilot, not a booking system or an exhaustive directory.

## Demo flow

1. Open LocalPass and choose **Download for offline use**.
2. Ask: `I have 3 hours, COP 100,000. I like nature and local food.`
3. Review the time- and budget-constrained itinerary and its local-operator markers.
4. Enable **Simulate offline**, refresh, and build another plan.
5. Open **Local businesses** and **Essential** while offline.

Use [DEMO.md](./DEMO.md) for the presenter script and [CHALLENGE.md](./CHALLENGE.md) for the development-impact framing.

## Run and verify

```bash
pnpm install
pnpm --filter @hashpass/localpass test
pnpm --filter @hashpass/localpass build
pnpm --filter @hashpass/localpass test:browser
```

The browser suite exercises desktop and narrow mobile layouts in light and dark mode, including COP parsing, requested-place ranking, language switching, simulated-offline persistence, cached reloads, and horizontal-overflow checks.

## How it works

The bundled destination pack makes first use helpful. When downloaded, the pack is stored in IndexedDB and the service worker caches the app shell and destination data. The on-device engine extracts hours and COP budgets, ranks place names, locations, descriptions, and tags, then only includes options that fit the stated time and budget.

Read the [architecture](./ARCHITECTURE.md), [offline design](./docs/offline-design.md), and [data sources](./docs/data-sources.md) for implementation details and evidence boundaries.

## Beyond the pilot

LocalPass has a documented path from this software MVP to a physical-to-digital destination network. The proposed **LocalPass Node** can distribute versioned destination packs without mobile data; the **LocalPass Guide** concept supports dynamic QR experiences for local guides and operators. Hardware remains optional infrastructure, never a gate to basic participation.

- [Commercial model](./docs/commercial/README.md)
- [Go-to-market plan](./docs/commercial/go-to-market.md)
- [Dynamic QR compatibility protocol](./docs/trust/qr-protocol.md)
- [Guide verification model](./docs/trust/guide-certification.md)
- [Hardware companion](./docs/hardware-companion.md)

## Product boundaries

Costs, opening hours, availability, and demo operator names require local confirmation. LocalPass is not an emergency service, a booking platform, or a certification authority. Cloud enrichment is optional; it does not replace the local data contract or inject generated content into the experience.
