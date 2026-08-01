# CDN cache-busting: the `_hpv` query-string cache key

**Status: fixed and live, 2026-07-31.** `hashpass.tech`'s production CloudFront
distribution (source account, `E2SQE7ZSNJ4MMI`) now whitelists the `_hpv`
query parameter as a cache-key dimension. Before this fix, the web app's
forced-reload cache-buster could not bypass a stale CDN edge cache — only
the browser/service-worker layers, not CloudFront itself.

## The gap

`performHardReload()` (`apps/mobile-app/lib/version-checker.ts:52-69`)
navigates to `window.location.href` with a fresh `?_hpv=<timestamp>` query
param appended, specifically to force a real network fetch past the service
worker, HTTP disk cache, and bfcache. It's called from both the automatic
forced-update path (`checkVersionAndClearCache()`,
`version-checker.ts:155`) and the update-modal's "Update Now" button
(`VersionUpdateNotification.tsx:35`). `_layout.tsx:180-189` strips the param
via `history.replaceState` once the fresh page mounts, so it's a one-time
marker, not a persistent URL param.

That guarantee held for every cache layer *except* the CDN. The production
front door — `aws_cloudfront_distribution.site` in
[`packages/infra/terraform/stacks/aws/main.tf`](../../../../packages/infra/terraform/stacks/aws/main.tf)
— had `forwarded_values { query_string = false }`. CloudFront's cache key
ignored query strings entirely, so `?_hpv=1` and `?_hpv=2` both resolved to
the exact same cached object at the same path. If CloudFront's edge still
held a stale copy of `index.html` or a JS bundle (e.g. mid-propagation of a
deploy invalidation, or any other lingering-cache condition), a user who hit
"Update Now" or triggered the forced-update path could still land back on
the stale bundle — the reload genuinely reached the network, but the network
handed back the same stale CDN response every time.

Found via a P2 code-review finding that traced the mismatch between the
client's fresh-fetch guarantee and the CDN's actual cache-key configuration.

## The fix

`packages/infra/terraform/stacks/aws/main.tf`'s `default_cache_behavior`
now uses CloudFront's query-string "whitelist" mode:

```hcl
forwarded_values {
  query_string            = true
  query_string_cache_keys = ["_hpv"]

  cookies {
    forward = "none"
  }
}
```

Only `_hpv` is forwarded to the origin and varies the cache key — every
other query string is still dropped, so cache efficiency for hashed static
assets and normal page loads is unaffected. Since `_hpv` is always a fresh
`Date.now()` value, any request carrying it is guaranteed to be a full cache
miss at the edge, which is exactly the property `performHardReload()`
already assumed it had.

Applied live via a `-target`-scoped `terraform apply` against
`aws_cloudfront_distribution.site` (id `E2SQE7ZSNJ4MMI`) on 2026-07-31,
scoped specifically to avoid an unrelated Route53/GitHub Pages diff already
pending in that stack's full plan (see "Known pending drift" below).
Verified live via:

```bash
aws cloudfront get-distribution-config --id E2SQE7ZSNJ4MMI --profile default \
  --query 'DistributionConfig.DefaultCacheBehavior.ForwardedValues'
```

which now returns `"QueryString": true` and `"QueryStringCacheKeys": {"Items": ["_hpv"]}`.

## Known pending drift in `stacks/aws` (unrelated, not touched by this fix)

A full (non-targeted) `terraform plan` against this stack currently also
proposes creating GitHub Pages DNS records for `hashpass.club` (A/AAAA/CNAME)
and normalizing a trailing dot on `aws_route53_record.site_www`. That drift
predates this fix, is unrelated to CDN cache-key behavior, and was
deliberately left untouched by scoping the apply to
`-target=aws_cloudfront_distribution.site`. Don't assume a clean `terraform
plan` on this stack until that drift is investigated and resolved
separately.

## Same anti-pattern, not yet live elsewhere

Two other CloudFront resources define the identical
`forwarded_values { query_string = false }` cache behavior and would need
the same whitelist fix before they matter:

- `packages/infra/terraform/stacks/hashpass-web/main.tf` — two
  `aws_cloudfront_distribution` resources (`site`, `dev_site`), both gated
  `count = 0` today (`enable_cloudfront`/`dev_enable_cloudfront` are forced
  `false` in that stack's locals) because the target account still can't
  create new CloudFront distributions — see the "Blocker discovered" note
  under `bsl.hashpass.tech` / `bsl-dev.hashpass.tech` above.
- `packages/infra/terraform/modules/aws_static_site_pipeline/main.tf` — the
  shared module both `hashpass-web` and `bsl-target` call into; same
  dormant `count = 0` status for the same reason.

If/when the target account's CloudFront verification unblocks and either of
these distributions goes live in front of the mobile-app web build, apply
the same `query_string = true` / `query_string_cache_keys = ["_hpv"]` change
there — otherwise this exact bug reappears on whichever distribution ends up
serving production traffic.
