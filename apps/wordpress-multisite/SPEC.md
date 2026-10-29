---
id: wordpress-multisite-local-prototype
type: module-design
status: draft
title: WordPress Multisite local prototype
tags: [wordpress, multisite, local-development]
---

## Responsibility

Provide a disposable local WordPress Multisite network for validating the Blog and News editorial experience without depending on production services.

## Boundary

The Compose stack is loopback-only and must not provision AWS or DNS, reuse production credentials, or import production content. Production infrastructure and configuration remain separate.

## Contract

- Blog is the primary local site at `blog.localhost:8088`; News is mapped to `news.localhost:8088`.
- News `home` and `siteurl`, login action, and post-login redirect use the mapped News host after every bootstrap, including recovery from partial setup.
- Authentication cookies are scoped to the current mapped hostname, without the development port. WP-CLI, which has no request host, uses host-only cookie behavior. The two mapped domains intentionally require separate browser logins.
- `blogwriter` is a Contributor on Blog only, `newswriter` is a Contributor on News only, and `sharededitor` is an Editor on both. Contributor controls must not allow publishing; the local administrator is the only Super Admin.

## Rationale

Using WordPress's generated `news.blog.localhost` address would hide failures in custom-domain login and cookie handling. Separate mapped hosts exercise the production topology, where the two sites have unrelated root domains and cannot share a browser cookie.

## Verification

The local smoke test checks mapped login URLs and cookie scope, role boundaries, site rendering, and recovery. Browser acceptance checks the visual editor and mapped-host role workflows.
