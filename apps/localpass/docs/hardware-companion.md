# Hardware companion — LocalPass Node

## Purpose

LocalPass Node extends the software MVP to cover a harder development constraint: users who have little or no mobile data and may not have downloaded the destination pack before arriving.

The node is a **distribution companion**, not an AI inference device.

### Hardware responsibilities

- create local Wi-Fi
- host a captive portal
- expose essential destination information
- distribute the same versioned destination pack used by the PWA
- provide a health endpoint for demo / field checks

### Phone responsibilities

- persistent local storage
- bilingual retrieval
- constraint scoring
- itinerary generation
- saved plans
- optional cloud AI while connected

## Critical browser/security constraint

The production PWA should remain HTTPS-hosted. Browsers generally require a secure context for service workers, so an ESP8266 serving plain HTTP at a private IP must not be presented as if it can reliably install the complete PWA.

Therefore the MVP uses two hardware flows:

### Flow A — user already has LocalPass

1. User connects to LocalPass Node.
2. Portal offers `pack.json`.
3. User downloads the file.
4. LocalPass imports the file using a normal file picker.
5. Phone disconnects from the node.
6. All core planning/search flows run locally.

### Flow B — user does not have LocalPass

1. User connects to LocalPass Node.
2. Captive portal opens.
3. User receives a lightweight bilingual essential guide immediately.
4. The portal can still distribute the destination data file.
5. Full PWA installation is deferred until secure connectivity is available.

This is a more credible development architecture than claiming the ESP8266 itself runs AI or securely installs a PWA.

## MVP hardware bill of materials

- 1 × NodeMCU ESP8266 or Wemos D1 Mini
- USB cable
- USB power bank / charger
- optional printed QR card: “FREE LOCAL GUIDE — NO MOBILE DATA REQUIRED”

## Demo sequence

1. Show phone with mobile data disabled.
2. Connect to `LocalPass-Guatape`.
3. Open captive portal.
4. Show essential bilingual information.
5. Download destination pack.
6. Import pack into LocalPass.
7. Disconnect from the node.
8. Ask for a constrained itinerary.
9. Show the PWA still works offline.

## Stop conditions

Hardware is a P2 enhancement. Stop hardware work if:

- Wi-Fi AP is not stable after 30 minutes of debugging
- filesystem upload cannot be made reproducible
- hardware work threatens software demo/video/submission deadlines

Software must remain independently submittable.
