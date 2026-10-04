# Architecture

```text
                  CONNECTED PREPARATION
                           │
                 AI enrichment / curation
                           │ structured JSON
                           ▼
                  GUATAPÉ DESTINATION PACK
                           │ download once
                           ▼
  ┌──────────────────── ORDINARY PHONE ────────────────────┐
  │ IndexedDB pack │ local retrieval │ rules engine        │
  │ PWA cache      │ offline itinerary │ saved plan         │
  └─────────────────────────────────────────────────────────┘
```

The UI imports a bundled seed pack so a first visit is useful, then saves the user-requested copy in IndexedDB. A cache-first service worker preserves the application shell and destination JSON. Network state and a separate simulation flag are visible; neither disables local capabilities.

`engine.ts` extracts hours, COP budget, and bilingual interest aliases. Candidates must fit time and budget, are weighted by matching tags, and receive a deliberate local-ownership boost. The engine returns place IDs and structured itinerary items; the UI resolves those IDs against the trusted pack. A future online planner must follow the same contract.

## Offline contract

No core action calls an API. Once the shell and pack are stored, search, planning, business discovery, essentials, language switching, and itinerary persistence run locally. The service worker uses cache-first responses and falls back to the cached app shell for navigation.
