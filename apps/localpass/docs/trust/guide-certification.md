# Guide verification and certification

## Principle

**Payment does not equal certification.**

LocalPass separates:

1. platform participation;
2. identity/profile verification;
3. professional certification.

## Participation levels

### Community contributor

- LocalPass account;
- basic QR/profile;
- destination pack access;
- no claim of professional certification.

### Verified Guide

- identity/profile evidence checked;
- dynamic guide QR;
- verification status visible;
- eligible for hardware programs subject to availability.

### Certified Guide / Trusted Local

- professional credential from an approved issuer;
- credential provenance visible;
- credential status and expiry where applicable;
- eligible for official destination programs.

## Issuer registry

The protocol should support multiple approved issuers.

Potential issuer types:

- OpenProof;
- municipality;
- tourism authority;
- accredited tour operator;
- parks authority;
- guide association;
- university or training institution;
- other approved credential organization.

OpenProof can be the first or default technical issuer, but should not be the only organization capable of issuing recognized credentials.

## Credential record

A normalized record may include:

```json
{
  "credential_id": "cred_...",
  "subject_id": "guide_...",
  "issuer_id": "issuer_...",
  "credential_type": "professional_tour_guide",
  "jurisdiction": "CO-ANT",
  "issued_at": "2026-10-01T00:00:00Z",
  "expires_at": null,
  "status": "valid",
  "proof": "..."
}
```

## Fees

LocalPass may charge for:

- identity/verification processing;
- premium account tools;
- hardware;
- re-issuance/admin handling;
- managed partner integrations.

Such fees do not guarantee a successful verification or certification result.

## Display rules

Never show:

- “certified” when only identity was verified;
- an expired/revoked credential as valid;
- a paid badge that visually imitates a professional credential.

Traveler-facing UI should expose issuer provenance in a concise way.
