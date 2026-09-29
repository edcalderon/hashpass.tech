# HASHPASS product context

<!-- impeccable:product-schema 1 -->

## Platform

adaptive

## Users

HASHPASS serves event attendees, organizers, and speakers. Attendees discover
events, manage access passes, arrange meetings, and use community features;
organizers and speakers contribute the event, programme, and media information
that attendees rely on.

## Product Purpose

HASHPASS connects events, organizers, speakers, and attendees. Public visitors
should be able to understand the service and discover real upcoming events
without signing in. Authenticated users manage passes, rewards, account data,
meeting arrangements, and community activity.

## Positioning

The product brings event discovery, event-specific access passes, programme
information, and attendee community workflows together in one account-aware
experience across web and native mobile.

## Operating Context

Public landing and event-discovery surfaces use event catalogs and organizer
media as their source of truth. Authenticated surfaces support event agendas,
pass management, meetings, rewards, and account workflows. Wallet enrollment
and onboarding run locally on the device while production wallet capabilities
remain gated or pending.

## Capabilities and Constraints

- Event catalogs, agenda data, speaker information, and organizer media supply
  factual content; the interface must not invent event listings or balances.
- The non-custodial wallet is in development. Client-side keys, encrypted
  backups, and enrollment/onboarding are implemented locally.
- Production wallet creation, chain reads, signing, external recovery
  compatibility, and hardware integrations are gated or pending and must not be
  presented as live or audited.
- The product supports light and dark modes and English, Spanish, and Korean
  interface copy.
- Account isolation and device-local wallet secrets must be preserved across
  web and native implementations.

## Brand Commitments

The product name is HASHPASS. Preserve the existing product identity, real
organizer media, and truthful event content. Reusable interface contracts live
in `DESIGN.md` and the shared UI primitives; product work should preserve their
accessibility and reduced-motion requirements.

## Evidence on Hand

The repository contains event catalogs, agenda and speaker data, organizer
media, pass workflows, local wallet enrollment/onboarding, and the corresponding
web/native application surfaces. Do not fabricate testimonials, balances,
upcoming events, wallet audits, or production chain integrations when those
artifacts are absent.

## Product Principles

1. Keep event and account data truthful and canonical.
2. Make discovery useful before sign-in and workflows reliable after sign-in.
3. Treat wallet secrets as device-local and keep gated capabilities clearly
   labeled as pending.
4. Preserve consistent, accessible behavior across web and native mobile.

## Accessibility & Inclusion

Support keyboard and touch interaction, visible focus and disabled/busy states,
translated copy, light and dark themes, and system reduced-motion preferences.
Keep controls usable with long Spanish or Korean translations and assistive
technology labels.
