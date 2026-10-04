# LocalPass Node

LocalPass Node is the optional hardware companion for the World Bank Small AI for Development MVP.

It does **not** run the AI model. Its job is to make destination knowledge available when mobile data or public internet is unavailable.

## MVP role

- ESP8266 / NodeMCU creates a local Wi-Fi access point: `LocalPass-Guatape`.
- A captive portal is served from the device over local Wi-Fi.
- The portal exposes a bilingual lightweight landing page, a health endpoint, and a downloadable Guatapé destination pack.
- The existing LocalPass PWA remains the primary compute/runtime environment on the phone.
- The node can also act as a "zero-connectivity fallback" by exposing essential information directly from its captive portal.

## Important browser constraint

A service worker cannot normally be installed from plain HTTP on `192.168.4.1`. Therefore the ESP8266 is **not** treated as a full PWA bootstrap origin.

The safe MVP flow is:

1. Connect to `LocalPass-Guatape`.
2. Captive portal opens.
3. User can read essential guidance immediately.
4. User can download `pack.json`.
5. A preinstalled LocalPass PWA can import that local file.
6. If the PWA is not installed, the captive portal still provides a useful lightweight guide while connected to the node.

This avoids pretending the hardware can securely install the production PWA without internet.

## Hardware

Recommended for the hackathon:

- NodeMCU ESP8266 or Wemos D1 Mini
- USB power bank or USB supply
- Optional LED for ready / connected state

The raw ESP-12F can work but adds unnecessary power and flashing complexity.

## Firmware endpoints

- `/` — captive portal / lightweight guide
- `/pack.json` — downloadable destination pack
- `/health` — JSON health response
- all unknown routes — redirect to captive portal

## Build

Requires PlatformIO.

```bash
cd hardware/localpass-node
pio run
pio run -t upload
pio run -t uploadfs
```

The pre-build script copies the current LocalPass Guatapé pack from:

`apps/localpass/public/data/guatape.json`

into:

`hardware/localpass-node/data/pack.json`

before building the filesystem image.

## Definition of done

- Phone sees `LocalPass-Guatape`.
- Connecting opens or can manually open `http://192.168.4.1`.
- Portal loads with no upstream internet.
- `/health` returns ready status.
- `/pack.json` downloads successfully.
- Essential instructions remain visible from the node.
- Demo can power-cycle the node and recover without reconfiguration.

## Future submodule extraction

This directory is intentionally self-contained so it can become a Git submodule without changing the app contract.

Once a dedicated repository exists:

```bash
git subtree split --prefix=hardware/localpass-node -b localpass-node-history
# push the split branch to hashpass-tech/localpass-node
git rm -r hardware/localpass-node
git submodule add https://github.com/hashpass-tech/localpass-node.git hardware/localpass-node
```

Do not add a broken `.gitmodules` entry before the dedicated repository exists.
