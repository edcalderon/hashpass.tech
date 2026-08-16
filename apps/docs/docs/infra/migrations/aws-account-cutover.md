# HASHPASS AWS Account and DNS Cutover

> Status: active, staged migration. Public DNS is still delegated to the source account. Last audited: 2026-08-16.

This runbook moves HASHPASS-owned DNS and the remaining delivery resources from the legacy AWS account to the HashPass AWS account without changing mailbox providers or creating an untested traffic cutover.

| Role | AWS account | Local AWS CLI profile |
| --- | --- | --- |
| Source (legacy) | `058264267235` | `default` |
| Target (HashPass) | `952191196420` | `hashpass` |

## Scope and mail-provider policy

| Domain | Target hosted zone | Mail provider after cutover | Rule |
| --- | --- | --- | --- |
| `hashpass.tech` | `Z071072129KV7AWT9B0DA` | Hostinger Email | Preserve Hostinger MX, SPF, DKIM, `autodiscover`, and `autoconfig`. Keep `include:amazonses.com` in the single SPF record while SES sends application mail. |
| `hashpass.club` | `Z071178839CVVJDHQDNNO` | TLAO | Preserve the existing TLAO MX, SPF, DKIM, DMARC, TLS report, and auto-configuration records exactly. Do not add Hostinger records. |
| `hashpass.info` | `Z00577161PBYNBXR7HPU2` | TLAO | Preserve the existing TLAO mail records exactly. Do not add Hostinger records. |
| `hashpass.lat` | `Z07096652QWZKNQHJRQH0` | No configured mailbox routing | Do not introduce mail records as part of this migration. |

The registrar is not managed by Route 53 Domains in either AWS account. Registrar nameserver changes therefore happen in the external registrar console only, after the target service cutover gates have passed.

## Completed staging

The Terraform-managed `packages/infra/terraform/stacks/hashpass-dns` stack owns the target hosted zones. On 2026-08-16 it was extended to include `hashpass.info`, then applied with `AWS_PROFILE=hashpass`.

All non-`NS`/`SOA` records were staged from source to target without changing public delegation:

- `hashpass.tech`: Hostinger mail records were copied and stale target WorkMail records were replaced. Target-only ACM validation CNAMEs were retained. Two legacy `bls2025` alias records remain unchanged because their source-zone alias target cannot be imported into another hosted zone.
- `hashpass.club` and `hashpass.info`: TLAO records were copied unchanged.
- `hashpass.lat`: the three existing CloudFront/ACM records were copied.

The Route 53 change IDs were `C04456253BUFHEBVMF7FY` (`.tech`), `C0851910ZQOJXEIVKDVC` (`.club`), `C06048691AJI2G17Y8UKQ` (`.info`), and `C08519151PAI9OFT829PH` (`.lat`); all reached `INSYNC`.

The target certificate `arn:aws:acm:us-east-1:952191196420:certificate/7dd3e108-0639-4eaa-9538-fea5710e0f01` is issued for `hashpass.tech` and `www.hashpass.tech`. Its `www` validation CNAME was added to both zones (source change `C05278821HVMCTJB2QUZP`, target change `C066748434FKHVW7VBI4P`) so it remains valid before and after delegation.

At this point the public registrar still delegates all four zones to the source-account nameservers. That is intentional: the staged zones are a rollback-ready copy, not a live cutover.

## Current dependency map

```text
public registrar
  -> source Route 53 zones (currently authoritative)
      -> source CloudFront front doors
          -> target-account S3 website origins
      -> target API Gateway custom domains (api.hashpass.tech, api-dev.hashpass.tech)

target Route 53 zones (staged, not authoritative)
  -> copied DNS records and target ACM validation records
  -> ready for delegation only after target front doors own their aliases
```

The critical remaining dependency is CloudFront. The source account currently owns the CloudFront alternate-domain names for `hashpass.tech`, `www.hashpass.tech`, `dev.hashpass.tech`, `bsl.hashpass.tech`, and `bsl-dev.hashpass.tech`; their origins already point at target-account S3 website buckets. The target account currently owns the API Gateway custom domains and their certificates, but does not yet own the primary CloudFront aliases. A CloudFront alternate domain cannot be served by two distributions, so copying DNS alone cannot complete this migration.

## Required cutover sequence

### 1. Complete target delivery resources

1. Create target-account ACM certificates in `us-east-1` for every CloudFront alias to move, including `hashpass.tech` and `www.hashpass.tech` together. Add the validation CNAMEs to the staged target zone and wait for `ISSUED`.
2. Create target CloudFront distributions with the target S3 origins and matching behavior, SPA fallback, security headers, cache policy, error handling, logging, and price class.
3. Validate each target distribution using its CloudFront domain before attaching production aliases.
4. Recreate any remaining source-only BSL pipelines, build roles, runner resources, secrets, and alarms in the target account. Do not copy secrets into source control; migrate them through their owning secret/parameter service.
5. Record each replacement resource ARN and validation evidence in the migration change record.

### 2. Reconcile staged DNS

Immediately before the registrar change, compare source and target records excluding zone-owned `NS` and `SOA` records. Resolve differences deliberately:

- keep Hostinger records only on `hashpass.tech`;
- keep TLAO records on `.club` and `.info`;
- preserve all active ACM/SES/Brevo verification records;
- replace source CloudFront aliases with the new target CloudFront aliases only after the domain aliases have moved;
- repair or retire the two legacy `bls2025` records separately rather than treating their source-zone alias as portable.

Lower mutable-record TTLs to 300 at least 24 hours before the change. Do not lower delegation TTLs by editing Route 53 `NS` records; the registrar controls the public delegation.

### 3. Move aliases, then delegate

1. Remove or associate each alternate domain from the source CloudFront distribution only when the equivalent target distribution is deployed and validated.
2. Attach the alternate domain and target-account certificate to the target distribution, then wait for CloudFront deployment.
3. Update target Route 53 aliases to the target distributions.
4. Change nameservers at the external registrar to the target zone's four nameservers for one domain at a time, beginning with `hashpass.tech`.
5. Query each authoritative target nameserver and public resolvers for A/AAAA, MX, TXT, DKIM, API, and required subdomains before moving to the next domain.

### 4. Post-cutover validation

- `https://hashpass.tech`, `https://www.hashpass.tech`, `https://dev.hashpass.tech`, BSL routes, and `https://api.hashpass.tech/api/config/versions` return the expected target service.
- `contact@hashpass.tech` receives through Hostinger and Thunderbird/IMAP works.
- `.club` and `.info` mail continues through TLAO; test inbound and outbound mail without changing their mail records.
- SES/Brevo messages pass SPF, DKIM, and DMARC.
- Monitor CloudFront, API Gateway, Lambda, pipeline, and email-provider logs for at least the agreed rollback window.

## Rollback

Within the rollback window, restore the external registrar delegation to the source zone nameservers. Do not delete target zones, target certificates, or target distributions during rollback. This returns DNS authority while keeping the target environment available for diagnosis.

## Source-account retirement

Only after every domain has been stable through the rollback window:

1. Export a final Route 53 record-set backup and ACM/CloudFront inventory.
2. Confirm no live registrar delegates to a source hosted zone.
3. Confirm no production CloudFront distribution, pipeline, runner, secret, or API domain remains in the source account.
4. Remove source resources using their IaC or service-specific retirement path, then delete the empty source hosted zones last.

Never delete source zones or AWS WorkMail until these checks are complete. WorkMail is no longer the MX target for `hashpass.tech`, but historical mailbox retention/export remains a separate decision.
