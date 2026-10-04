# LocalPass QR compatibility protocol

## Goal

Allow LocalPass-compatible QR experiences to work across:

- basic printed codes;
- first-party LocalPass Node hardware;
- first-party LocalPass Guide hardware;
- future third-party compatible devices;
- verified and non-verified guides.

Hardware purchase is **not** required to participate in the protocol.

## Identity model

Each entity receives stable identifiers:

- `guide_id`
- `venue_id`
- `device_id`
- `destination_id`
- `place_id`

A Guide device has one persistent device identity while its current attraction/context can change.

## Dynamic Guide QR

A Guide session resolves:

```text
guide_id
+ device_id
+ active place / route
+ destination-pack version
+ session identifier
+ issued-at time
+ optional signature
```

The QR should carry only a compact opaque token or resolver reference, not the entire destination record.

Example online resolver:

```text
https://localproof.org/q/7KmQ2
```

`localproof.org` is this app's own live, project-controlled domain (see
`packages/infra/terraform/stacks/localproof` and
[DEPLOYMENT_MAP.md](../../../docs/docs/infra/DEPLOYMENT_MAP.md)), not an
unreserved third-party-ownable name — a device encoding this domain in a QR
code cannot be redirected to an unrelated registrant the way an unprovisioned
domain could. The `/q/<token>` resolver endpoint itself is not implemented
yet (the domain currently serves the static offline-tourism web app only);
building it is a prerequisite for shipping connected mode, not an assumption
this protocol gets to skip.

## Online and offline modes

There is an important browser constraint: a normal public HTTPS URL cannot simply be hijacked by a local ESP device without valid TLS infrastructure.

Therefore LocalPass Guide should intentionally support two QR presentation modes.

### Connected mode

Display:

```text
https://localproof.org/q/<token>
```

The cloud resolver returns the active guide/place context.

### Local/offline mode

The wearable starts its local Wi-Fi/captive portal and displays a QR pointing at the local endpoint, for example:

```text
http://192.168.4.1/q/<token>
```

or a captive-portal-relative flow after the traveler joins the displayed LocalPass SSID.

Because the Guide device uses an editable e-ink display, switching between online and local QR modes is expected behavior rather than a printed-QR limitation.

A future production implementation may use per-device HTTPS hostnames/certificates, but the MVP does not depend on that complexity.

## QR states

Recommended screen states:

- attraction;
- route;
- essential information;
- tour summary;
- offline local mode;
- Wi-Fi onboarding;
- inactive / expired session.

## Device compatibility

A device can call itself **LocalPass-compatible** only after passing a future compliance suite covering:

- QR payload/version support;
- device identity;
- session expiry;
- local portal behavior;
- pack/version handling;
- revocation;
- accessibility;
- safe fallback state.

This allows third-party manufacturers without forcing them to buy first-party hardware.

## Security

Production goals:

- unique device key;
- public-key registration;
- signed session manifests;
- short-lived session references where appropriate;
- revocation for compromised devices;
- issuer/guide credential verification independent of device ownership.

The QR indicates context. It must not be treated as proof of professional certification by itself.
