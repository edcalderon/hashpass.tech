---
id: mobile-app-components
type: module-design
status: draft
title: Mobile app components
---

## Responsibility
Compose reusable UI for the mobile app's native and web experiences, presenting product data through accessible, responsive controls and visual components.

## Boundary
Components may shape data for presentation but do not own event-registry or backend environment selection. Event eligibility rules specific to a presentation surface remain local to that surface.

## Global event carousel
The global landing carousel keeps Hash Poker as its persistent default. It shows other events only while their completion boundary is in the future: use a valid `eventEndDate`, fall back to a valid `eventStartDate`, and hide events with neither. This rule does not filter a specifically selected event or tenant carousel.

This prevents completed events from appearing as upcoming without removing the Hash Poker landing entry point.
