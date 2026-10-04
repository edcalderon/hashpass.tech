# Privacy and data principles

LocalPass is specifically designed for constrained-connectivity environments. That creates an opportunity to minimize unnecessary data collection.

## Principles

### Local-first

If itinerary generation, search or destination retrieval can happen on-device, prefer local processing.

### Minimum necessary telemetry

Collect only telemetry needed for:

- reliability;
- security;
- aggregate product measurement;
- operator rewards;
- consented analytics.

### Avoid traveler identity by default

A traveler should be able to scan a LocalPass QR and access core destination information without creating an account.

### Separate operator and traveler data

Guide/venue verification records are not the same dataset as anonymous traveler usage.

### Explain rewards data

Operators should know which metrics affect rewards, tiers or reputation.

### Offline packs should be inspectable

Destination pack version and freshness should be visible where practical.

## Example data categories

| Category | Default |
|---|---|
| Destination pack | stored locally |
| Itinerary | local by default |
| QR scan count | aggregate / pseudonymous |
| Guide identity | only for guide account/verification |
| Professional credential | trust registry / issuer |
| Precise traveler location | avoid unless a feature clearly requires consent |
| Payment data | handled by payment provider where possible |
| Device telemetry | minimum needed for health/security |

## Retention

Production policy should define retention by data class rather than retaining every event indefinitely.

## Children

LocalPass is not designed to profile children. Any family/education deployment requires an explicit policy review.

## Production notice

A full privacy notice must be drafted for each commercial market and must identify:

- controller/provider;
- lawful bases;
- categories collected;
- retention;
- subprocessors;
- cross-border transfers;
- user rights;
- contact channels.
