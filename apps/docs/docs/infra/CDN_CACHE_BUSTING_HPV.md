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

## BSL had the identical bug too — fixed 2026-08-01, not Terraform-managed

`bsl.hashpass.tech` (`E2FCDJB1JCS7TW`) and `bsl-dev.hashpass.tech`
(`E279RW9PP52TC0`) serve the exact same `apps/mobile-app` web build (via
`build-bsl-static-site.sh`) and therefore the exact same
`performHardReload()`/`?_hpv=` mechanism — but neither distribution is
covered by the `stacks/aws` fix above; they're separate CloudFront
distributions using the newer `CachePolicyId` mechanism rather than legacy
`forwarded_values`, both pinned to the AWS-managed `Managed-CachingOptimized`
policy (`658327ea-f89d-4fab-a63d-7e88639e58f6`), which has
`QueryStringBehavior: none` — same root cause, same defeat of the cache
buster. This one is arguably worse for BSL: per the "Known gap" notes in
`DEPLOYMENT_MAP.md`, BSL's build script also doesn't invalidate CloudFront
on deploy (cross-account credential limitation), so a stale edge object here
has no forced-refresh mechanism at all until natural TTL expiry.

Found while investigating a user report of `bsl.hashpass.tech` still
showing an old version after clicking "Update Now." At the time of checking,
the origin was actually already fresh (`curl` showed `versions.json`/`sw.js`
correctly reporting the just-deployed version, `last-modified` ~14 minutes
old) — so that specific report was very likely deploy-timing or a
browser tab holding an old service worker, not this bug actively firing.
But the underlying gap was real and is now closed pre-emptively.

**Fix:** since neither distribution is Terraform-managed (both predate
proper IaC ownership, same as noted elsewhere in `DEPLOYMENT_MAP.md`), this
was applied via direct AWS CLI, matching how these two distributions have
always been managed post-cutover:

```bash
# Custom cache policy: CachingOptimized clone, query strings whitelisted to _hpv
aws cloudfront create-cache-policy --cache-policy-config file://bsl-hpv-cache-policy.json --profile default
# → 63f0a203-7003-40af-96b6-3bac93c0645d ("hashpass-bsl-hpv-cache-key")

# Applied to both distributions' DefaultCacheBehavior.CachePolicyId
aws cloudfront get-distribution-config --id E2FCDJB1JCS7TW --profile default   # then update-distribution --if-match
aws cloudfront get-distribution-config --id E279RW9PP52TC0 --profile default  # then update-distribution --if-match
```

The custom policy mirrors `Managed-CachingOptimized` exactly (`DefaultTTL`
86400 / `MaxTTL` 31536000 / `MinTTL` 1, gzip+brotli enabled, no
headers/cookies forwarded) except `QueryStringsConfig`:

```json
"QueryStringsConfig": {
  "QueryStringBehavior": "whitelist",
  "QueryStrings": { "Quantity": 1, "Items": ["_hpv"] }
}
```

Verify with:

```bash
aws cloudfront get-distribution-config --id E2FCDJB1JCS7TW --profile default \
  --query 'DistributionConfig.DefaultCacheBehavior.CachePolicyId'
# → 63f0a203-7003-40af-96b6-3bac93c0645d for both distributions once InProgress → Deployed
```

**Not fixed by this change:** the missing on-deploy invalidation for BSL.
That's a separate, larger fix (needs invalidation credentials reachable from
the target-account build worker, or a cross-account role) and wasn't in
scope here — this fix only makes the CDN cache key correctly vary when a
client explicitly asks it to (via `_hpv`), it doesn't make deploys
proactively push fresh content to every edge location faster than natural
TTL/revalidation already does.
