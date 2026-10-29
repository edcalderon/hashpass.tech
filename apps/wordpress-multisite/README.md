# HASHPASS Blog + News Multisite

Tracks [issue #543](https://github.com/hashpass-tech/hashpass.tech/issues/543). This repository contains a **local-only Docker prototype**. The production operations guide for Lightsail, DNS, TLS, Terraform, access and recovery is [`packages/infra/terraform/stacks/hashpass-wordpress-multisite/README.md`](../../packages/infra/terraform/stacks/hashpass-wordpress-multisite/README.md).

## Environment boundary

Production is one WordPress Multisite network serving two separate sites:

- Blog: <https://hashpass.blog>
- News: <https://hashpass.news>

The local Compose prototype does not provision AWS or DNS. It uses unrelated disposable credentials and sample posts; none of those credentials, posts or database contents were copied to production. Keep `hashpass.club` unchanged and do not reuse Directus authentication or data.

## Production editorial workflow

### Sign in and select a site

Use the dashboard for the site you intend to edit:

- Blog: <https://hashpass.blog/wp-admin/>
- News: <https://hashpass.news/wp-admin/>
- Network Admin: <https://hashpass.blog/wp-admin/network/> (authorized Super Admins only)

The domains are separate cookie scopes, so expect to sign in separately on Blog and News. Use each site's own `/wp-login.php` and dashboard URL; do not expect a Blog session to authenticate on News.

### Add and scope editorial users

Keep network-wide privileges to a minimum. A site Editor is not a Super Admin.

| WordPress role | Scope and use |
|---|---|
| Contributor | Assign to Blog or News only. Can create and edit their own drafts, but cannot publish; submit work for review. |
| Editor | Assign separately to each site they need to edit. Can review, edit, and publish posts for that site. A shared Editor must be added to both sites; this does not require Super Admin. |
| Administrator | Site-level administration. Reserve for a trusted site operator, not a routine writer. |
| Super Admin | Network-wide access to both sites and network settings. Keep membership minimal. |

Recommended provisioning flow:

1. In Network Admin, create the person's network user under **Users → Add New**. Do not grant Super Admin.
2. Add that existing user to Blog or News from that site's **Users** screen or **Network Admin → Sites → All Sites → Edit → Users**. Select only the role needed on that site.
3. Repeat the site assignment only when access to both sites is approved. Verify the account by signing in at each authorized domain and confirming that the other site is not available to a site-scoped writer.

No named production writers or editors have completed role acceptance yet. The local disposable browser trial verified a Blog-only contributor, a News-only contributor, and a shared Editor using the visual editor; it does not prove production account configuration. SMTP is not configured, so do not rely on invitation, notification, or password-reset email. See the [production runbook](../../packages/infra/terraform/stacks/hashpass-wordpress-multisite/README.md) before changing administrator access.

### Draft, review, and publish

1. Sign in on the correct site and use **Posts → Add New**. Contributors save their draft and submit it for review; an Editor on that site performs the final review and publication.
2. Check factual claims against [`PRODUCT.md`](../../PRODUCT.md). Do not invent event data, testimonials, metrics, or describe gated wallet capabilities as live.
3. Until moderation and mail are configured, disable both comments and pingbacks in the post's **Discussion** settings before publishing. WordPress defaults are open; the launch post's closed settings do not change those defaults.
4. Preview the post on desktop and mobile, publish only with the required approval, then verify its public page and links.

**Content gate:** “Welcome to HASHPASS” by **HASHPASS Editorial** is the only real production post authorized before writer/editor acceptance. Its comments and pingbacks are closed. Do not publish other real content on Blog or News until the production acceptance gates are complete.

### Maintain Blog branding and navigation

The live Blog keeps the native **Twenty Twenty-Five** block theme. Its branded homepage, article layout, header, footer, and global styles are native Site Editor customizations saved in WordPress, not theme-file changes and not Git-versioned. News remains a separate site; do not assume Blog's customizations apply there.

Open **Appearance → Editor** from the Blog dashboard:

- **Styles**: maintain the editorial colors, typography, spacing, and readable article width.
- **Templates**: maintain the homepage and single-post layouts.
- **Template Parts → Header**: the Site Logo block uses a PNG rendering of the canonical Hashpass symbol from `apps/web-app/public/logo-hashpass.svg`, with a separate text wordmark. Replace it through the Site Logo block and use approved brand assets. Do not upload SVGs, enable unsafe SVG MIME handling, or install an SVG-upload plugin.
- **Template Parts → Footer**: maintain the eight product, company, and legal destinations below. Verify every destination after changing the links.

| Footer label | Destination |
|---|---|
| Blog | <https://hashpass.blog/> |
| News | <https://hashpass.news/> |
| Events | <https://hashpass.tech/attendings/> |
| About | <https://hashpass.tech/about/> |
| Documentation | <https://hashpass.tech/documentation/> |
| Status | <https://hashpass.tech/status> |
| Privacy | <https://hashpass.tech/documentation/legal/privacy-policy/> |
| Terms | <https://hashpass.tech/documentation/legal/terms-of-service/> |

The Blog header also links to Blog, News, and About. Site Editor changes live in WordPress rather than this repository; record intentional edits and verify the public desktop/mobile layouts. A snapshot restore has not yet been rehearsed, so do not treat Git as a recovery copy for these customizations.

## Local prototype

Requirements: Docker Engine and Docker Compose.

```bash
cp apps/wordpress-multisite/.env.example apps/wordpress-multisite/.env
# Replace the example values with unique local-only passwords.
apps/wordpress-multisite/scripts/setup-local.sh
```

Local sites:

- Blog: <http://blog.localhost:8088>
- News: <http://news.localhost:8088>
- Local Network Admin: <http://blog.localhost:8088/wp-admin/network/>

WordPress binds only to `127.0.0.1:8088`; MariaDB has no published port. Local credentials live in the ignored `.env` and must never be reused in production. The bootstrap creates a local Super Admin, a Blog-only Contributor, a News-only Contributor, a shared Editor on both sites, and disposable sample posts. The News site is mapped to `news.localhost` rather than WordPress's generated `news.blog.localhost`; setup refreshes its `home` and `siteurl`, and local cookies follow the request hostname.

Reset the disposable local network with:

```bash
docker compose --env-file apps/wordpress-multisite/.env \
  -p hashpass-content -f apps/wordpress-multisite/compose.yaml down --volumes
```

### Verify local changes

```bash
apps/wordpress-multisite/tests/local-network-smoke.sh
```

The smoke test uses a unique Compose project, temporary credentials, and disposable volumes, then removes them. It verifies both sites render; the mapped News login action, redirect, and cookie scope; contributor membership and publish/edit permissions; Super Admin boundaries; shared Editor permissions; and recovery from a partially provisioned network. It does not create or validate production users.
