# HASHPASS self-hosted operations

These are portable templates for a Plane Community and Frappe Helpdesk deployment. Set all domains, secrets, backup endpoints, and access controls in a private operator environment before deployment.

The public subset deliberately excludes host-access automation, cloud identity configuration, business data, live topology, and operational runbooks. `plane/compose.yaml`, `frappe/compose.yaml`, Caddy, backup scripts, and the environment template remain here so compatible systems can validate the container contract without learning Hashpass production details.

## Production deployment visibility

`.github/workflows/self-hosted-vps-deploy.yml` is the production deployment record for this stack. It runs for relevant changes merged to `main` and can also be dispatched manually from `main`.

The workflow:

- authenticates to the control plane with GitHub OIDC;
- sends an exact-commit deployment through AWS Systems Manager hybrid activation;
- preserves the private runtime `.env` and service credentials;
- reports only the SSM status, response code, revision, and public readiness results;
- checks Plane, Helpdesk, and the MCP gateway after deployment; and
- opens or updates a GitHub issue when deployment or readiness fails, then closes that issue after a successful recovery.

Host identity, runtime paths, deployment identity, role ARN, region, and probe URLs are repository variables prefixed with `SELF_HOSTED_VPS_`. Do not put their values, remote output, container logs, or environment contents in tracked files or workflow summaries.

## Plane object storage

The bundled MinIO server and initializer are optional and run only with the
`local-object-storage` Compose profile. The example environment enables that
profile for a self-contained installation. When using an external S3-compatible
service, leave `COMPOSE_PROFILES` unset and configure Plane's private S3 endpoint,
region, bucket, and credentials instead; deployment will not pull or wait for
the local MinIO containers.
