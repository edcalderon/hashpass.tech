# HASHPASS Blog + News Multisite prototype

Issue: [#543](https://github.com/hashpass-tech/hashpass.tech/issues/543)

This is a **local-only prototype** of one WordPress Multisite network containing two separate sites:

- Blog: `http://blog.localhost:8088`
- News: `http://news.localhost:8088`
- Shared admin: `http://blog.localhost:8088/wp-admin/`

It demonstrates independent site content, the native Twenty Twenty-Five block theme, site-scoped contributor accounts, and a shared editor. Nothing here is production-ready and no AWS resources or DNS records are created by these local scripts.

## Start locally

Requirements: Docker Engine and Docker Compose.

```bash
cp apps/wordpress-multisite/.env.example apps/wordpress-multisite/.env
# Replace the example values with local-only passwords.
apps/wordpress-multisite/scripts/setup-local.sh
```

The WordPress service binds only to `127.0.0.1:8088`; MariaDB has no published port. Local user credentials are in the ignored `.env` and must never be reused in production. The setup provisions:

- `hashpassadmin`: local multisite administrator.
- `blogwriter`: contributor on Blog only; cannot publish.
- `newswriter`: contributor on News only; cannot publish.
- `sharededitor`: editor on both sites; can review/publish content.

The local bootstrap creates sample posts so each site's public rendering can be checked immediately. The setup is idempotent once the network is installed. To reset the disposable local network, run:

```bash
docker compose --env-file apps/wordpress-multisite/.env \
  -p hashpass-content -f apps/wordpress-multisite/compose.yaml down --volumes
```

## Verify

```bash
apps/wordpress-multisite/tests/local-network-smoke.sh
```

The smoke test uses a per-run unique Compose project, temporary credentials, and disposable volumes, then removes them. It verifies both hostnames serve content, tests contributor isolation and publishing permissions on both sites, checks Super Admin boundaries, and simulates recovery from a partially provisioned network.

## Production boundary

This Compose setup remains a local-only prototype; its scripts do not provision AWS resources or DNS. The separate production Lightsail stack now serves [hashpass.blog](https://hashpass.blog) and [hashpass.news](https://hashpass.news) over HTTPS.

The local demo credentials, sample posts, and database were not copied to production. Production still needs real writer/editor accounts, mail delivery, a browser-based editorial trial, and a snapshot-restore rehearsal. Do not reuse Directus authentication or its database.
