# Hashpass WordPress Multisite operations

Tracks [issue #543](https://github.com/hashpass-tech/hashpass.tech/issues/543). This runbook covers the production WordPress network at `hashpass.blog` and `hashpass.news`; local editorial workflows are in [`apps/wordpress-multisite/README.md`](../../../../../apps/wordpress-multisite/README.md).

## Production footprint

| Area | Deployed configuration |
|---|---|
| Compute | Lightsail instance `hashpass-editorial-wordpress`, blueprint `wordpress_multisite_ls_1_0`, bundle `micro_3_0` (1 GiB RAM, 40 GB SSD, 2 TiB transfer; about $7/month), availability zone `us-east-2a` |
| Region | `us-east-2` |
| Network | Both domains resolve to the same Lightsail static IPv4. Route 53 A records have TTL 300; Terraform looks up the existing public zones and manages the records when enabled. Get the current address with `terraform output -raw static_ip`; do not paste it into public tickets or docs. |
| Ingress | Public TCP 80/443 for HTTP redirect and HTTPS. SSH is restricted to the approved operator workspace `/32`; do not publish the range. |
| TLS | Let's Encrypt DNS-01 certificate covers both domains and expires **2027-01-27**. HTTP redirects to HTTPS. Renewal and expiry alerts are not automated. |
| Snapshots | Lightsail automatic instance snapshots enabled daily at 06:00 UTC. Snapshot storage is billed separately. |
| Editorial | Twenty Twenty-Five Multisite; Blog has its approved welcome post and native Site Editor branding. News has no real posts. No local sample content or credentials were copied to production. |

The two sites are a separate WordPress network. They do not use Directus users/data, and `hashpass.club` is unchanged. WordPress content, users, media, TLS, mail, and Site Editor customizations are not managed by Terraform.

### Current production gates

- No named production writers or editors have completed role acceptance in a browser. The disposable local browser trial is not production acceptance.
- SMTP is not configured; do not rely on invitations, notifications, moderation, or password-reset email.
- The initial administrator credential has not been securely rotated. **Do not retrieve or display the existing generated password.** Complete an approved reset/rotation that does not reveal it before onboarding writers.
- No snapshot restore rehearsal has been completed, and actual snapshot storage cost has not yet been recorded.
- Certificate renewal and alerting are outstanding; complete them well before 2027-01-27.
- Low-volume memory/load checks remain outstanding before deciding whether `micro_3_0` is sufficient.

## Terraform ownership and safe changes

The stack in this directory manages the Lightsail instance, static IPv4 and attachment, public-port rules, automatic-snapshot schedule, and (when enabled) the two Route 53 A records. Its AWS provider is pinned to the `hashpass` profile and `us-east-2`, with an `allowed_account_ids` guard tied to the private `expected_account_id`. It does not create hosted zones or change registrar delegation. It does not configure WordPress domain mapping, accounts, passwords, themes, posts, mail, TLS/Certbot, or snapshot restoration.

This stack has **no remote Terraform backend**. Its state is the local `terraform.tfstate`, ignored by Git. Preserve and protect the existing operator copy; do not initialize a fresh worktree and plan/apply against live resources without the matching state. If state is absent or resource addresses do not match, stop rather than create/import infrastructure ad hoc. `prevent_destroy` protects the Lightsail instance from an accidental destroy plan, but it does not protect the state file or the other resources.

The stack is excluded from `.github/workflows/infra-deploy.yml`; pushes do not apply it. Changes are operator-run and must follow these gates:

1. Use the `hashpass` AWS profile only. Before any mutation, compare its caller identity non-printingly with the private expected account ID. From the repository root, run this without shell tracing; it reads only the expected ID and never prints either value:

   ```bash
   set -euo pipefail
   expected_id="$(python3 - <<'PY'
   from pathlib import Path
   for line in Path('.env').read_text().splitlines():
       key, separator, value = line.partition('=')
       if separator and key.strip() == 'AWS_TARGET_ACCOUNT_ID':
           print(value.strip().strip(chr(34) + chr(39)).strip())
           break
   PY
   )"
   if [[ -z "$expected_id" ]] || ! actual_id="$(aws sts get-caller-identity --profile hashpass --query Account --output text 2>/dev/null)" || [[ "$actual_id" != "$expected_id" ]]; then
     echo 'The hashpass AWS identity could not be verified; stopping.' >&2
     unset expected_id actual_id
     exit 1
   fi
   unset expected_id actual_id
   echo 'AWS identity verified.'
   ```

   Never print or commit account IDs, credentials, private `.env`, or filled `terraform.tfvars`.
2. Check the current month-end cost forecast and the `hashpass-production-monthly-max-50-usd` budget. Stop if the forecast is unavailable or could exceed the **$50/month** ceiling.
3. Confirm the existing local state is present and matches the live stack. Review the complete plan; stop on any unexpected replacement, deletion, ingress, or DNS change.
4. Keep SSH limited to the currently approved operator `/32`. The Terraform variable validation rejects `0.0.0.0/0` but does not enforce `/32`; review the exact planned SSH range manually. Never reuse the example CIDR in `terraform.tfvars.example`.
5. Only change DNS after reviewing the two A-record plans. Keep public web ingress enabled only while the approved public sites require it and TLS remains valid.

From the repository root, the stack wrapper can validate and plan using the private `terraform.tfvars` in this stack directory:

```bash
packages/infra/terraform/scripts/stack.sh hashpass-wordpress-multisite validate
packages/infra/terraform/scripts/stack.sh hashpass-wordpress-multisite plan
```

Apply only after the checks above and a human review of the full plan:

```bash
packages/infra/terraform/scripts/stack.sh hashpass-wordpress-multisite apply
```

The wrapper defaults to `terraform.tfvars`. Keep that file, `terraform.tfstate`, and saved plans out of Git; saved plans can contain resolved sensitive values. Do not run `destroy` for this production stack.

### Host access

Routine publishing and site appearance changes belong in WordPress Admin, not an SSH session. For approved host maintenance, obtain short-lived Lightsail SSH access from the operator workstation using the `hashpass` profile. Keep returned key material only in a mode-0700 temporary directory with mode-0600 key files, verify host fingerprints against an independently trusted value, run only the required command, then remove the temporary files. Never print the access-details response, put AWS credentials on the instance, or put credentials in shell history, logs, issues, or screenshots. If this verified short-lived access path is unavailable, stop rather than opening SSH more broadly.

Use WP-CLI only for narrowly scoped maintenance after the host is verified. Do not read the blueprint's initial password file; rotate the administrator credential through an approved non-disclosing reset path. See the editorial runbook for dashboard and role workflows.

## Snapshots and recovery

Daily Lightsail instance snapshots are the only configured backup in this stack; there is no separate WordPress database/content export or automated restore. Snapshot storage cost has not been reconciled. A successful snapshot is not a substitute for a tested restore, and no RTO/RPO is claimed yet.

A restore rehearsal is still required:

1. Select a known-good snapshot and create a separate test instance in `us-east-2`; do not overwrite or delete production. A clone contains production data and TLS/authentication key material, so treat it as production-sensitive.
2. Keep test access restricted to the approved operator. Do not attach the production static IP or change public DNS. Use a temporary host override or equivalent isolated access to verify both WordPress sites, posts/media, site mapping, roles, theme customizations, HTTPS behavior, and admin access.
3. Record snapshot age, restore duration, missing data, and snapshot storage cost. Confirm the recovery procedure can remain under the monthly budget, then remove the test instance and its snapshots when the rehearsal is complete.
4. Rehearse any static-IP reattachment or DNS change separately. Do not move the production IP or change public DNS until the owner approves an actual recovery.

Until this rehearsal passes, treat recovery as **unverified**. Instance snapshots do not include Terraform's local state file; protect the state separately.

## TLS and monthly operations

The active Let's Encrypt certificate uses DNS-01 for both hostnames. No automatic renewal or expiry alert is configured. Schedule and test renewal before **2027-01-27** without installing AWS credentials on the Lightsail instance. After renewal, verify the certificate chain, both SANs, HTTPS responses, and HTTP-to-HTTPS redirects for both domains. The selected Lightsail-packaged Multisite image is not the old Bitnami image; do not apply Bitnami-only `bncert-tool` instructions.

At initial deployment the recorded monthly forecast was **$20.63**; a conservative additional **$10** allowance kept it below the $50 ceiling. This is a historical forecast, not the current bill. The `micro_3_0` bundle is about $7/month and the two Route 53 zones about $1 total; actual snapshot storage, tax, mail, and excess transfer are additional. If memory/load checks require it, `small_3_0` provides 2 GiB RAM, 60 GB SSD, and 3 TiB transfer for about $12/month before those additions. Recheck actual usage and forecast monthly and before every infrastructure change.

Monthly operator checks:

- Confirm the automatic snapshot completed and review stored-snapshot cost.
- Check the 50 USD monthly budget/forecast, instance disk and memory/load, and whether resize is needed.
- Check certificate expiry and both public HTTPS/redirect paths.
- Review WordPress core/theme updates and account/role membership; confirm a recent Lightsail snapshot before high-impact changes, remembering that restore is not yet rehearsed.
- Keep mail, writer/editor browser acceptance, and restore rehearsal tracked on issue #543 until complete.

## Reference

- [Terraform stack source](./main.tf)
- [Stack variables and example](./variables.tf) · [`terraform.tfvars.example`](./terraform.tfvars.example)
- [Local Multisite prototype and editorial workflow](../../../../../apps/wordpress-multisite/README.md)
- [AWS Lightsail Multisite guide](https://docs.aws.amazon.com/lightsail/latest/userguide/amazon-lightsail-quick-start-guide-wordpress-multisite.html)
- [Map domains to WordPress Multisite](https://docs.aws.amazon.com/lightsail/latest/userguide/amazon-lightsail-add-blogs-as-domains-to-your-wordpress-multisite.html)
- [Lightsail packaged-blueprint migration notes](https://docs.aws.amazon.com/lightsail/latest/userguide/migrate-from-bitnami-to-lightsail-blueprints.html)
- [Lightsail Let's Encrypt walkthrough](https://docs.aws.amazon.com/lightsail/latest/userguide/amazon-lightsail-lets-encrypt-certbot-wordpress.html) — for a related regular WordPress image; verify compatibility before adapting it to Multisite.
