# Hashpass WordPress Multisite on AWS Lightsail

Tracks [issue #543](https://github.com/hashpass-tech/hashpass.tech/issues/543).

This stack is prepared for one AWS Lightsail **Lightsail-packaged** WordPress Multisite blueprint and a static IPv4 in `us-east-2`. It is separate from the existing Directus SSO service and the `hashpass.club` static Next.js site. It does not import Directus users/data.

The selected blueprint is `wordpress_multisite_ls_1_0` (version 7.1 in the read-only AWS check), not the older Bitnami `wordpress_multisite` blueprint. AWS has announced the Bitnami blueprints stopped receiving updates May 19, 2026, and new instances cannot be created from them starting November 19, 2026. The Lightsail-packaged blueprint is the maintained choice for a new instance.

## Cost baseline

| Configuration | Instance | Two Route 53 zones | Snapshots | Approx. added monthly cost |
|---|---:|---:|---:|---:|
| Minimum viable start | `micro_3_0`: $7 (1 GiB RAM, 40 GB SSD, 2 TiB transfer) | ~$1 total | Seven daily snapshots; billed by stored GB | ~$8 base + actual snapshot storage |
| Capacity fallback | `small_3_0`: $12 (2 GiB RAM, 60 GB SSD, 3 TiB transfer) | ~$1 total | Seven daily snapshots; billed by stored GB | ~$13 base + actual snapshot storage |

The Lightsail bundle prices and specifications were checked read-only in `us-east-2`. AWS bills actual provisioned/used services. Estimates exclude domain registration, mail delivery, taxes, transfer above the Lightsail plan allowance, and optional services. A 1-GiB instance must pass low-volume performance/memory checks; switch to `small_3_0` if it does not. Automatic snapshots are enabled by default and their stored capacity is an additional charge.

The account has a USD 50/month production ceiling. Before any `terraform apply`, use the `hashpass` profile, verify account identity non-printingly against the private expected account ID, and verify a current month-end account cost forecast that includes the added Lightsail and DNS/snapshot costs. Stop if the forecast is unavailable or could exceed the cap. Never apply with the legacy `default` profile.

## Production gates

1. The domain owner creates the `hashpass.blog` and `hashpass.news` public Route 53 hosted zones and reviews existing registrar delegation. This stack does not change registrar delegation.
2. Review the current AWS bill and forecast. Month-to-date spend alone is not a complete month forecast.
3. Confirm the account through a non-printing check against the private value; do not echo account IDs or credentials. From this directory:

   ```bash
   set -euo pipefail
   expected_id="$(python3 - <<'PY'
   from pathlib import Path
   for line in Path("../../../../../.env").read_text().splitlines():
       key, separator, value = line.partition("=")
       if separator and key.strip() == "AWS_TARGET_ACCOUNT_ID":
           print(value.strip().strip("\\\"'").strip())
           break
   PY
   )"
   if [[ -z "$expected_id" ]]; then
     echo 'Private expected AWS account ID is missing; stopping.' >&2
     exit 1
   fi
   if ! actual="$(aws sts get-caller-identity --profile hashpass --query Account --output text 2>/dev/null)"; then
     echo 'Could not verify the hashpass AWS identity; stopping.' >&2
     unset expected_id
     exit 1
   fi
   if [[ "$actual" != "$expected_id" ]]; then
     echo 'The hashpass AWS identity does not match the private expected account; stopping.' >&2
     unset actual expected_id
     exit 1
   fi
   unset actual expected_id
   ```

   This reads only the expected-account setting without sourcing/evaluating the full private `.env`. Adjust the path if the repository layout changes. Do not paste credentials or account identifiers into issue comments/logs.
4. Create a private `terraform.tfvars` from the example; set `expected_account_id` privately and replace the documentation-only `admin_ssh_cidr` with a trusted IPv4 CIDR. Never use `0.0.0.0/0` for SSH. Do not commit the private file.
5. Keep `public_web_enabled = false` for initial provisioning. The Lightsail firewall exposes only SSH from `admin_ssh_cidr`; HTTP and HTTPS remain closed.
6. Configure and verify valid TLS for **both** root domains and an HTTP-to-HTTPS redirect before setting `public_web_enabled = true` or entering WordPress admin credentials. The Lightsail-managed HTTPS setup is documented for the regular WordPress blueprint, not as a turnkey solution for this Multisite blueprint; the Bitnami `bncert-tool` steps do not apply to the selected image. Validate the exact Certbot/Apache procedure against the Lightsail-packaged image before production use. Do not bypass this gate or log in over HTTP.
7. Only after the owner has created both hosted zones and reviewed the exact A-record changes, set `enable_dns_records = true` and inspect the DNS plan.

## Plan/apply commands

Run from this directory. `terraform apply` is production provisioning and must wait for every gate above.

```bash
terraform init
terraform fmt -check
terraform validate
terraform plan -out=tfplan
# Apply only after reviewing the complete plan and confirming all gates:
terraform apply tfplan
```

Terraform restricts the stack to the supplied expected account ID. Do not output that value. Instance deletion is protected with `prevent_destroy` to avoid accidental content loss.

## Configure the network after TLS is verified

1. Retrieve the initial application password privately from the Lightsail SSH session using `cat ~/application_credentials`. Never print it in logs or put it in Terraform outputs. Store it in the approved password manager, then replace it after the first secure sign-in.
2. Define the primary domain as `hashpass.blog`. In Network Admin, create the News site and map its site address to `hashpass.news`. Follow the AWS Multisite guide for domain mapping and add the documented `COOKIE_DOMAIN` configuration so sign-in works across mapped domains.
3. Create named user accounts. Assign Blog writers as Contributors on Blog only; News writers as Contributors on News only; assign shared Editors separately to both sites. Keep Super Admin membership minimal. Test authorizations from separate accounts.
4. Confirm each site serves its own content over HTTPS and HTTP redirects to HTTPS. Check canonical URLs, feeds, sitemap, mobile layout, and browser/editor access.
5. Configure mail delivery before relying on invitations, notifications, or password reset emails.
6. Confirm automatic snapshots are enabled and complete a documented restore rehearsal before publishing real content. Record the actual snapshot storage cost.

Useful AWS documentation:

- [Migrate from Bitnami to Lightsail-packaged blueprints](https://docs.aws.amazon.com/lightsail/latest/userguide/migrate-from-bitnami-to-lightsail-blueprints.html)
- [Set up WordPress Multisite on Lightsail](https://docs.aws.amazon.com/lightsail/latest/userguide/amazon-lightsail-quick-start-guide-wordpress-multisite.html)
- [Add blogs as domains to WordPress Multisite](https://docs.aws.amazon.com/lightsail/latest/userguide/amazon-lightsail-add-blogs-as-domains-to-your-wordpress-multisite.html)
- [Lightsail WordPress Let's Encrypt walkthrough](https://docs.aws.amazon.com/lightsail/latest/userguide/amazon-lightsail-lets-encrypt-certbot-wordpress.html) — it documents a related regular WordPress image; validate compatibility before adapting it to Multisite.

The stack deliberately does not create WordPress users/passwords, install paid plugins, import Directus data, or publish content. Those are handled after an administrator securely completes first-run setup.
