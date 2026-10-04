# One-day delegation blueprint — LocalPass + LocalPass Node

## Objective

Complete a reliable World Bank Small AI for Development tourism MVP before the submission cutoff.

The MVP must prove:

1. useful destination intelligence works offline on an ordinary phone;
2. a compact Guatapé pack can be downloaded and persisted;
3. a constrained itinerary can be produced with no cloud call;
4. local micro-businesses are surfaced intentionally;
5. an optional ESP8266 companion can distribute the pack and essential information when mobile data is unavailable.

The hardware enhancement must never jeopardize the software submission.

---

## Workstreams

### Workstream A — Core software (P0)

Owner: primary application engineer

Deliver:
- offline PWA
- IndexedDB destination pack
- bilingual retrieval
- budget/time/interest itinerary engine
- local-business boost
- essential information
- offline simulation
- production deployment

Acceptance:
- disable network, reload, search, build itinerary, open essentials
- no core request depends on cloud

### Workstream B — Hardware companion (P2 until P0 is stable)

Owner: firmware / hardware engineer

Deliver:
- NodeMCU/Wemos ESP8266 firmware
- SoftAP `LocalPass-Guatape`
- captive portal
- `/pack.json`
- `/health`
- LittleFS build containing current pack
- repeatable flash instructions

Acceptance:
- cold boot to usable AP in under 30 seconds
- portal reachable from phone with upstream internet disabled
- pack downloads
- power cycle recovers automatically

### Workstream C — PWA local-pack import (P1)

Owner: frontend engineer

Deliver:
- "Import local pack" action
- JSON file picker
- schema validation before persistence
- reject invalid packs with human-readable error
- show source/version after import

Acceptance:
- file downloaded from node can be imported with internet disabled
- imported pack survives reload

### Workstream D — Data + evidence (P1)

Owner: research/data engineer

Deliver:
- 10–20 high-value Guatapé entities
- local-business metadata
- bilingual content
- transportation/essential sections
- data source notes
- explicit prototype disclaimers

Acceptance:
- no invented official claims
- demo entries clearly marked where not verified

### Workstream E — Submission assets (P0)

Owner: demo/pitch lead

Deliver:
- demo video
- tech video
- team video
- public GitHub
- live URL
- architecture diagram
- Hack-Nation submission
- backup Google Form submission

Acceptance:
- all assets locally backed up before final submission window

---

## Execution order

### Phase 0 — freeze scope (15 minutes)

Do:
- keep one destination: Guatapé
- keep two languages: Spanish/English
- keep one itinerary workflow
- keep hardware to distribution only
- reject auth, payments, booking, blockchain, native app work

Exit criterion:
- every team member can state the same 60-second demo.

### Phase 1 — prove offline software (90 minutes)

Do:
1. build production bundle;
2. download destination pack;
3. persist to IndexedDB;
4. load core shell through service worker;
5. disable network;
6. reload;
7. generate itinerary locally.

Exit criterion:
- complete offline software loop works before any hardware work expands.

### Phase 2 — add local file import (60 minutes)

Do:
1. add file input;
2. parse JSON;
3. validate required destination/places/essential structure;
4. save validated pack;
5. show imported version/source;
6. test with browser fully offline.

Exit criterion:
- a local JSON file can replace/refresh the pack without network.

### Phase 3 — hardware bring-up (90 minutes hard cap)

Do:
1. flash NodeMCU/Wemos;
2. mount LittleFS;
3. create SoftAP;
4. captive DNS redirect;
5. serve `index.html`;
6. serve synced `pack.json`;
7. verify `/health`;
8. power-cycle.

Exit criterion:
- phone downloads pack with cellular/mobile data disabled.

If not achieved by cap:
- stop.
- use software-only demo.
- keep hardware architecture in roadmap/tech video only.

### Phase 4 — end-to-end hardware demo (45 minutes)

Do:
1. phone in airplane mode, Wi-Fi enabled;
2. connect to node;
3. portal opens;
4. download pack;
5. import pack into LocalPass;
6. disconnect from node;
7. generate itinerary offline.

Record this once immediately as a backup demo.

### Phase 5 — polish (2 hours)

Do:
- mobile layout
- online/offline badge
- prominent local-business markers
- simple pack status
- error states
- concise impact copy
- architecture/diagram screenshots

Do not add features outside the demo path.

### Phase 6 — deploy + QA (60 minutes)

Test:
- production URL
- fresh browser
- installed/cached browser
- offline reload
- file import
- invalid pack rejection
- Spanish
- English
- budget constraint
- time constraint
- node portal if available

### Phase 7 — videos (90 minutes)

Demo video:
- problem
- destination pack
- constrained request
- disconnect
- offline response
- hardware node if stable
- local business impact
- closing claim

Tech video:
- PWA cache
- IndexedDB
- deterministic local engine
- destination pack contract
- hardware/software boundary
- why ESP8266 distributes but does not run AI
- secure-context limitation and honest fallback architecture

Team video:
- short introduction only

### Phase 8 — submission freeze

Use Colombia time:
- 07:00 README/repo freeze
- 07:15 begin both submissions
- 07:30 code freeze
- 07:45 target both submissions complete
- 08:00 official hard deadline

---

## Exact demo script

1. "Most AI travel tools assume stable internet. We designed for the moment that assumption fails."
2. Show Guatapé destination pack.
3. Enter: "I have 3 hours, COP 100,000, local food and nature."
4. Generate itinerary.
5. Show local-business recommendation.
6. Switch offline / disconnect network.
7. Reload.
8. Ask another question and generate plan locally.
9. Optional hardware:
   - connect to `LocalPass-Guatape`;
   - show captive portal;
   - download destination pack;
   - import into PWA;
   - disconnect from node;
   - continue offline.
10. Close: "LocalPass brings useful destination intelligence to the phones and infrastructure communities already have."

---

## Non-goals

Do not build:
- a full on-device LLM
- ESP8266 inference
- a real mesh network
- booking
- payments
- accounts
- blockchain
- multi-destination support
- expensive map stack
- native mobile app
- live operator dashboard

---

## Final definition of done

Software:
- [ ] public live URL
- [ ] PWA loads offline
- [ ] pack persists
- [ ] bilingual search works
- [ ] itinerary works offline
- [ ] local businesses surfaced
- [ ] essentials available
- [ ] tests pass

Hardware:
- [ ] AP starts
- [ ] portal loads
- [ ] pack downloads
- [ ] health endpoint works
- [ ] power cycle works
- [ ] hardware failure cannot break software path

Submission:
- [ ] public GitHub
- [ ] demo video
- [ ] tech video
- [ ] team video
- [ ] Hack-Nation submission
- [ ] Google Form backup
- [ ] submitted before cutoff
