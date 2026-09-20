# Landing responsive motion

The landing page uses short object-level motion to explain each feature. Keep
the illustration useful before animation starts and after animation stops.

## How-it-works scenes

Each card needs at least two related moving objects:

- Scan: scanner beam, QR cells, and confirmation mark.
- Allies: network nodes and a traveling packet.
- Meet: two message bubbles and the privacy lock.
- Rewards: the `$LKS` diamond, `$LKS`, `+5`, and `+10` rewards, with the
  supported Ethereum, Solana, and Bitcoin marks.

Web animations run only while their card is visible. Respect the user's reduced
motion setting. Native uses the same visual story with static vectors and the
existing lightweight section entrance.

## `$LKS` notation and attribution

Use `$LKS` in all customer-facing copy. `$LKS` is the Blockchain Latam
Foundation LATAM crypto-peso index; HASHPASS supports it as an incubator tech
lab and must not describe it as HASHPASS's own currency. Run
`pnpm --dir apps/mobile-app run check:currency-notation` after changing this
copy or its translations.

## Feature flip cards

The feature cards form a three-card row on wide screens. Below 700px, show one
centered card per row. Do not use a horizontal carousel on phone layouts. The
front and back must remain within the viewport in every supported locale.

## Mobile web viewport

Use `viewport-fit=cover` and `interactive-widget=resizes-content`. Set the root
to `100dvh`, prevent horizontal document overflow, and keep form controls at
least 16px on phone widths to avoid Safari focus zoom. Preserve browser pinch
zoom; do not add `user-scalable=no` or `maximum-scale=1`.

Check at 390px and 1440px before release. Confirm that the document and feature
grid scroll widths equal their client widths, that offscreen scenes stop, and
that reduced-motion mode removes looping effects.
