# Original Lukas landing page recovery

This stack serves `https://lukas.hashpass.tech` from a private S3 bucket through
CloudFront, using the existing production wildcard certificate. It manages only
this hostname, its defensive `lks.hashpass.tech` alias, and their shared hosting resources. It does not redirect to
`lukas.lat`, change the core app, or create an Android/global release.

## Source and scope

The original page survives in commit
`1133ab564f9e8a589bc49f02c3c95b67f177b096` (the historical `upstream/lukas` branch).
At the October 5, 2026 diagnosis, the hostname returned NXDOMAIN; its ACM
validation CNAME remained, but no serving record or matching CloudFront or
Amplify deployment was found in the production or legacy account.

`build.py` extracts the original landing components, translations, theme and
language providers, and the exact dependencies tracked in that commit. A minimal
Expo Router layout replaces the former full application shell so recovery does
not publish unrelated authentication, API, or event routes. Reviewed files in `overrides/` update the pinned source during the build. The
main coin now uses the original gold-and-black SVG from the Lukas protocol
site, matching the supplied reference. The landing CTA opens a wallet/HashPass
connection modal, supports Ethereum and Solana message signing, and shows the
Q2 2027 airdrop confirmation. The newsletter form writes to the independent
Lukas audience and can also opt the address into the existing HashPass list.
The separate `lukas.lat` protocol is unaffected.

The build needs about 2 GB of temporary disk space. It reads no `.env` files and
performs no package installation. Only static export files are published; source
maps, server handlers, and the historical public directory are excluded.

## Build

From the repository root, activate the pinned Node runtime and verify it:

```bash
nvm use
pnpm check:node
python3 packages/infra/terraform/stacks/hashpass-lukas-site/build.py /tmp/lukas-site
```

Use a new output directory. The result includes `recovery.json` with source
provenance, and `404.html` for genuine missing routes. `/` loads the original
router entry and navigates to `/lukas`; CloudFront maps `/lukas` and `/lks` to
the same landing page and maps other clean URLs to their exported HTML files
without rewriting JavaScript/assets or masking failures as successful pages.

## Local development

Start the restored landing alongside the normal development services with:

```bash
npm run dev:all -- --lukas-landing
```

The flag builds the pinned landing into an isolated temporary directory and
serves it at `http://127.0.0.1:4173/lukas` and
`http://127.0.0.1:4173/lks`. Override the port with `LUKAS_LANDING_PORT`; the
local server preserves both clean routes and the static asset paths used in
production.

## Infrastructure and publishing

Always use the `hashpass` profile. Supply `TF_VAR_expected_account_id` from the
private `AWS_TARGET_ACCOUNT_ID` without printing it, and perform the non-printing
STS equality check from `CLAUDE.md` immediately before every AWS mutation.
Terraform additionally enforces that account through `allowed_account_ids`.

Run `terraform init`, `terraform validate`, and a saved `terraform plan` in this
stack. Review resource actions before applying the saved plan. Never commit
state, plans, private variable values, or account-bearing logs. The local ignored Terraform state has an encrypted snapshot in the existing
private operations backup bucket at `terraform/hashpass-lukas-site/terraform.tfstate`.
Refresh that snapshot after future infrastructure changes; do not publish it.

Normal production releases publish this stack automatically when
`release-tag-on-merge.yml` calls the reusable `Lukas landing build and deploy`
workflow before creating the release tag. The
builder reads the root `package.json` version, writes it to `recovery.json`, and
the workflow refuses to deploy if the tag, package version, or live manifest do
not match. This keeps Lukas on the same release version as the app; there is no
independent Lukas version to update.

For initial provisioning or manual recovery, after the account check and
infrastructure apply, publish the built directory:

```bash
aws s3 sync /tmp/lukas-site s3://hashpass-lukas-landing-site/ \
  --profile hashpass --only-show-errors --cache-control 'public,max-age=300'
```

For subsequent publications, invalidate changed HTML paths on the distribution
reported by `terraform output -raw distribution_id`, after another account check.
The bucket is versioned, private, encrypted, and readable only through its scoped
CloudFront origin access control. There is no EC2, paid build pipeline, or
always-running application server; hosting uses metered S3/CloudFront usage under
the existing production budget.

## Verification and rollback

Check authoritative and public DNS A/AAAA answers, HTTP-to-HTTPS redirection,
trusted TLS, `/`, `/lukas`, and `/lks`, static assets, and a missing URL
returning 404.
Use an isolated browser for desktop and mobile; verify landing text, language
cycling, section navigation, FAQ expansion, no horizontal overflow, and no browser
exceptions. The landing connection flow signs an authentication message only; it never requests a seed phrase or private key. Token minting remains outside this landing page.

Rollback a content publication using S3 object versions or by republishing the
previous verified static export, followed by an HTML invalidation. Do not point
this hostname to GitHub Pages' `lukas.lat` site: that changes the requested page
and lacks a certificate/domain binding for this hostname.

## Recovery verification — October 5, 2026

- CloudFront reports `Deployed`; Terraform reports no pending changes.
- Authoritative DNS and public resolvers return A/AAAA answers.
- HTTP redirects to HTTPS; trusted TLS covers the hostname.
- `/`, `/lukas`, assets, and source provenance return 200; missing routes return 404.
- Desktop (1440px) and mobile (390px) browser checks pass for English/Spanish/
  Portuguese switching, section links, FAQ expansion/collapse, no horizontal
  overflow, no browser exceptions, and no failed requests.
- The repeatable builder reproduced all 43 originally uploaded export files
  byte-for-byte. `recovery.json` records the pinned source commit.

## 3D coin artwork and defensive alias

The hero uses the original gold-and-black LUKAS SVG and five currency coin SVGs
from `lukas.lat`, copied byte-for-byte into `overrides/public/coins/`. Its production
`LukasCoin` component adds layered orbit rings, depth shadows, and gentle floating
motion against a navy hero backdrop. Existing landing content and CTAs remain.
The artwork stops animating offscreen or when the document is hidden. System
reduced-motion disables the animation entirely. All six images have accessible
names. Colors and geometry are brand artwork, as permitted by `DESIGN.md`; shared
primitives and the design-debt baseline are unchanged.

The actual component is cataloged under **Brand / Lukas coin**, with desktop,
mobile, light, and dark stories. Storybook serves the same SVG directory as the
production builder. `recovery.json` records every override's SHA-256 alongside
the pinned historical source commit.

`lks.hashpass.tech` shares the existing CloudFront distribution and wildcard
certificate, with its own A/AAAA aliases. The viewer-request function returns a
permanent HTTPS redirect to `lukas.hashpass.tech`, before static URL rewriting,
preserving the path, repeated query parameters, and percent-encoded values.
Canonical-host requests continue through the existing static route handling.
No additional hosting server or distribution is needed.

Verified for this update: static export, design-system guards, changed-file and
component/story TypeScript checks, Storybook build, desktop/mobile rendering,
all SVG loads, reduced-motion behavior, offscreen pause, and no horizontal
overflow or browser errors. The previous verification above describes the
initial recovery; the current build includes the reviewed overrides.
