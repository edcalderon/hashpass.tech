# LocalPass AI

**Offline destination intelligence for Guatapé, Colombia.** This hackathon MVP addresses a development gap: most AI products assume cloud access, capable hardware, stable bandwidth, and digitally sophisticated suppliers. Tourism communities and travelers cannot always rely on those conditions.

LocalPass separates **AI preparation** from **offline execution**. A compact bilingual destination pack is downloaded once to IndexedDB; local intent extraction, retrieval, constraint scoring, and itinerary generation then run on the device. Offline operation is part of the architecture—not an error condition.

## Who benefits

- **Travelers** retain practical, bilingual guidance when mobile data disappears.
- **Small local operators** stay discoverable without building an app, paying marketplace commission, or remaining online.
- **Destination communities** gain a reusable, low-bandwidth knowledge layer for ordinary phones.

## What works offline

- Guatapé destination content and weighted local search
- time- and budget-constrained itinerary generation
- local business directory and offline contact guidance
- essential transport, emergency, health, safety, and phrase information
- saved itineraries, language switching, and the complete cached application shell

The prototype includes one destination, two languages, 14 places/experiences, and 9 local-operator demo entries. The directory is explicitly a demonstration, not an exhaustive or booking-ready source. Core flows make zero network requests after the pack and shell are cached.

## Run it

```bash
pnpm install
pnpm --filter @hashpass/localpass dev
pnpm --filter @hashpass/localpass test
pnpm --filter @hashpass/localpass build
```

For the core demo: load the app, download the pack, create a three-hour COP 100,000 plan, enable **Simulate offline**, refresh, and create another plan. See [DEMO.md](./DEMO.md).

## Prototype boundaries

Costs, opening hours, availability, and demo operator names must be confirmed locally. This is not an emergency service or booking platform. Cloud AI is intentionally optional; no arbitrary generated markup enters the UI. See [data sources](./docs/data-sources.md) and [architecture](./ARCHITECTURE.md).


## Commercialization and guide network

The MVP now includes a documented commercialization path for turning LocalPass into a physical-to-digital destination network.

- [Commercial model](./docs/commercial/README.md)
- [Business model](./docs/commercial/business-model.md)
- [Unit economics](./docs/commercial/unit-economics.md)
- [Operator rewards](./docs/commercial/operator-rewards.md)
- [Go-to-market](./docs/commercial/go-to-market.md)
- [Economic and network diagrams](./docs/commercial/system-diagrams.md)
- [Dynamic QR protocol](./docs/trust/qr-protocol.md)
- [Guide verification and certification](./docs/trust/guide-certification.md)
- [Draft Terms of Service](./docs/legal/TERMS_OF_SERVICE_DRAFT.md)
- [Hardware pilot terms](./docs/legal/HARDWARE_PILOT_TERMS_DRAFT.md)
- [Privacy and data principles](./docs/legal/PRIVACY_AND_DATA_PRINCIPLES.md)
- [LocalPass Guide wearable concept](../../hardware/localpass-guide/README.md)

The core commercial principle is: **software/QR access can be open, trust is independently verifiable, and hardware remains optional infrastructure rather than a gate to participation.**
