# Unit economics framework

This document defines what must be measured before LocalPass treats any hardware price or subscription as validated.

## LocalPass Node

Target production architecture:

- standardized PCB/electronics core;
- injection-molded or otherwise scalable structural shell;
- replaceable bamboo / thin-wood veneer faceplate;
- destination-specific artwork without changing the electronics;
- USB-C power;
- no expensive display required for the fixed venue product.

### Illustrative cost model

| Component | Pilot target |
|---|---:|
| Connectivity MCU + flash | $4–10 |
| Power + PCB + connectors | $4–8 |
| Enclosure | $4–12 |
| Wood/bamboo faceplate | $2–6 |
| Assembly/test/packaging | $5–12 |
| **Illustrative COGS target** | **$19–48** |

This is not a supplier quote.

A sustainable hardware price must also cover replacements, shipping, payment fees, support and failed units—not just bill of materials.

## LocalPass Guide

Recommended mature architecture:

- ESP32-class controller;
- small e-ink display for QR/context;
- rechargeable battery;
- USB-C;
- Wi-Fi/BLE;
- secure device key storage where practical;
- lanyard enclosure;
- optional haptic/buzzer/status LED.

### Illustrative cost model

| Component | Pilot target |
|---|---:|
| MCU + connectivity | $5–12 |
| E-ink display | $8–18 |
| Battery + charging | $4–8 |
| PCB + secure storage | $5–12 |
| Enclosure + lanyard | $5–12 |
| Assembly/test/packaging | $5–12 |
| **Illustrative COGS target** | **$32–74** |

For early low-volume builds the cost may exceed these targets.

## Revenue-quality metrics

Do not optimize only for hardware gross margin. Track:

- active device rate;
- 30/90-day retention;
- scans per active node/guide;
- destination-pack freshness;
- verified operator participation;
- traveler-to-local-business discovery;
- support hours per device;
- replacement/failure rate;
- monthly recurring revenue per deployed device;
- sponsor renewal rate;
- operator willingness to pay;
- cost per activated venue/guide.

## Contribution-margin model

```text
Hardware contribution
= hardware revenue
- manufacturing
- shipping
- payment fees
- expected warranty/replacement reserve

Monthly contribution
= subscription / destination allocation
- cloud + support
- content operations
- verification operations
- partner/reward cost
```

A hardware sale with negative lifetime contribution is acceptable only when an explicitly funded acquisition/sponsorship strategy justifies it.

## Example pilot cohort

For a 50-device pilot, measure three acquisition arms:

- 15 paid devices;
- 15 sponsor-funded devices;
- 20 loan/earn-to-own devices.

Compare retention, uptime, scans and content quality across all three groups before choosing the dominant commercial model.
