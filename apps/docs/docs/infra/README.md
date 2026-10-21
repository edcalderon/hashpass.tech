# Infra Docs

Current infrastructure documentation for HASHPASS lives here. These pages describe the live target-account `hashpass.tech` web stack, the `dev.hashpass.tech` development front door, the API/Lambda path, the BSL release pipeline, and the mobile Android runner layout.

## Active Docs

- [`DEPLOYMENT_MAP.md`](DEPLOYMENT_MAP.md)
- [`ENVIRONMENT_STRATEGY.md`](env/ENVIRONMENT_STRATEGY.md)
- [`ENVIRONMENT_VARIABLES.md`](env/ENVIRONMENT_VARIABLES.md)
- [`INFRA_NAMING_GUIDE.md`](INFRA_NAMING_GUIDE.md)
- [`EMAIL_DELIVERABILITY.md`](EMAIL_DELIVERABILITY.md) - Email providers by sender (Hostinger vs Brevo), DNS authentication, and spam-placement runbook
- [`migrations/aws-account-cutover.md`](migrations/aws-account-cutover.md) - active AWS account, DNS, and mail-provider cutover runbook
- [`api-gateway/`](api-gateway) - API Gateway and Lambda setup docs
- [`lambda/`](lambda) - Lambda deployment playbooks
- [`CLOUDINARY_CONFIG.md`](CLOUDINARY_CONFIG.md) - deprecated legacy compatibility only
- [`MAKE_S3_BUCKET_PUBLIC.md`](MAKE_S3_BUCKET_PUBLIC.md)
- [`SPEAKER_AVATARS_S3_SETUP.md`](SPEAKER_AVATARS_S3_SETUP.md)
- [`security/wazuh-integration-guide.md`](security/wazuh-integration-guide.md)

## Deprecated

- `packages/tools/scripts/DB_MIGRATION_GUIDE.md` and the dev-to-prod schema replay scripts it describes are deprecated and disabled (2026-10-21). They targeted the BSL project, now a frozen backup. Production schema changes go through `db:migrate --profile core-production`; see [`decisions/single-core-database.md`](decisions/single-core-database.md) and [`supabase-project-map.md`](supabase-project-map.md). The full list is in the [scripts README](../../../../packages/tools/scripts/README.md#deprecated-database-scripts).

Historical infra migrations, completed setup notes, and one-off fixes live in `archive/docs/`.
