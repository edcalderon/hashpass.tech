# Hashpass self-hosted operations architecture

## Decision and current state

Hashpass will run a private **Plane Community + Frappe Helpdesk** baseline on a provider-neutral Ubuntu VPS. Plane is the internal execution workspace; Frappe Helpdesk is the private support workspace. Both are backed by private databases and are exposed only through Caddy.

The Notion CEO HQ archive remains separate and serverless in AWS: the importer archives the allowed root and descendants before materializing selected work items. Notion-to-Plane remains one-way until idempotency, attachment, deletion, and restore drills pass.

Current state, reconciled 2026-09-27:

- The VPS has been reinstalled with Ubuntu LTS.
- Interactive administrator access is hardware-backed OpenSSH FIDO2. The bootstrap key was removed after verification; root, password, and keyboard-interactive SSH are disabled.
- The Hashpass AWS deployment identity was verified privately. An encrypted, versioned Terraform state bucket and encrypted DynamoDB lock table were created, and the generated Plane/Frappe bootstrap secret is held only in AWS Secrets Manager. No secret value is in Git or the VPS.
- The Terraform backend must explicitly use `AWS_PROFILE=hashpass`; raw Terraform otherwise selects an ambient credential and is denied state access. The profile-pinned three-resource plan was applied: one SSM managed-node role, its core policy attachment, and one short-lived, one-host activation.
- The SSM managed node is registered and online. Its enrollment was authenticated with the FIDO2 operator key; administrative commands now use SSM rather than weakening SSH.
- Docker Engine and Docker Compose are installed and verified on the VPS. `/opt/hashpass/self-hosted` and `/etc/hashpass` are root-owned deployment directories. No public ports or application containers have been opened/deployed.
- Plane, Frappe, DNS, public support, IAM Roles Anywhere, and the Notion schedule are **not yet deployed or verified**.
- The encrypted Notion archive infrastructure exists privately in AWS, but has no Notion integration credential and its schedule is disabled.

## Identity separation

Three identities have different authority. Do not merge them.

| Identity | Purpose | Authority | Prohibited use |
| --- | --- | --- | --- |
| FIDO2 operator | Human emergency and planned administration | Hardware-touched SSH and sudo only | CI, cron, containers, AWS workload calls |
| AWS SSM Hybrid managed node | Programmatic host administration | Session Manager and allowlisted Run Command | Reading application secrets or acting as a Plane/Frappe runtime |
| IAM Roles Anywhere workload | A specific service's AWS access | Short-lived credentials for exact secret, KMS, and S3 ARNs | SSH administration, wildcard secret access, CA administration |

No VPS workload may contain a long-lived AWS access key. `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` may appear only as runtime names required by an S3-compatible client; the tracked host configuration supplies provider-neutral object-storage inputs and must never contain AWS IAM keys.

## Provider-neutral boundary

```text
Caddy -> Plane + Frappe -> private PostgreSQL/MariaDB/Redis/Valkey/MinIO
                         -> encrypted, off-server S3-compatible backup repository

Notion integration -> AWS archive Lambda -> encrypted archive bucket + registry
```

`ops/self-hosted/` contains pinned Compose assets, backups, and Ansible playbooks. They require only an Ubuntu host, DNS records, outbound HTTPS, and S3-compatible backup storage. They do not encode an OVH API, AWS instance identity, public address, or provider disk/network resource.

`packages/infra/terraform/stacks/hashpass-vps-access` is an AWS adapter, not a VPS provisioner. It creates a one-node expiring SSM Hybrid Activation with only `AmazonSSMManagedInstanceCore`, and an opt-in IAM Roles Anywhere trust anchor, profile, and workload role whose permissions are exact input ARNs.

Moving to another VPS or cloud provider means applying the same host contract and changing only the small provider adapter for compute, DNS, firewall, and backup endpoint.

## AWS control plane

### SSM Hybrid: administration

Use AWS Systems Manager Hybrid Activation for programmatic host operations. The VPS initiates outbound TLS connections; SSM does not require an inbound administrative port. Create an activation with registration limit `1` and the shortest practical expiry. Treat its ID and code like a one-time enrollment secret and pass them only to `ops/self-hosted/ansible/playbooks/aws-hybrid-ssm.yml` through a secure operator channel.

The Terraform S3 backend is mandatory for this stack because an activation code is a sensitive Terraform output. Its bucket must permit the Hashpass deployment identity to list the state prefix and read/write its objects; its lock-table permission set is limited to the Terraform locking operations. Always set `AWS_PROFILE=hashpass` before Terraform backend initialization. Never fall back to local state or copy an activation output into a ticket, shell history, CI log, or `.env` file.

The SSM node role must remain administration-only. A CI or operator role may invoke only reviewed SSM documents against the tagged Hashpass node; do not grant arbitrary `SendCommand` broadly. Session Manager and Run Command are billable for hybrid nodes from 2026-09-30, so retain this path for deliberate administration, not application traffic.

### IAM Roles Anywhere: workload access

Use IAM Roles Anywhere only when a named VPS workload genuinely needs an AWS secret, KMS decrypt operation, or S3 prefix. The workload presents a client X.509 certificate to obtain short-lived role credentials through `aws_signing_helper credential-process`.

Before applying the access stack, provide and review all of the following:

- a public trust-anchor certificate bundle, never its CA private key;
- one client-certificate Common Name bound in the role trust policy;
- exact Secrets Manager ARNs;
- exact KMS key ARNs;
- exact S3 bucket and object-prefix ARNs.

The low-cost first stage must not create AWS Private CA by default. Use an existing approved CA or an offline/operator-controlled CA and import only its public certificate as the trust anchor. Store the workload private key root-readable only (`0400`), outside Git and the shared Compose `.env`; rotate and revoke the client certificate on host compromise or role change.

## Deployment gates

1. Apply and review the access Terraform plan using the `hashpass` AWS profile after confirming the target account privately.
2. Enroll the VPS once with `aws-hybrid-ssm.yml`; verify it appears as a managed node and close the activation window.
3. Install the signed AWS Roles Anywhere helper and configure `aws-roles-anywhere.yml` only if a specific workload has approved ARNs. Verify a temporary credential's role identity and denied access outside its allowlist.
4. Configure DNS, Caddy TLS, encrypted off-server backups, and monitoring.
5. Stream the generated bootstrap secret from AWS Secrets Manager directly into a root-owned host environment file (`/etc/hashpass/self-hosted.env`, mode `0600`) during a FIDO2-approved deployment session. Do not write it to the repository, a Compose directory, or terminal output. Complete the separately scoped backup-endpoint and application-service-token values before deployment.
6. Deploy pinned Plane and Frappe Compose assets; validate private database listeners, authenticated application health, backup, and restore.
7. Run the Notion importer manually in archive-only mode, then execute idempotency and restore drills before enabling the schedule or Plane materialization.

## Security controls

- Keep SSH key-only and root-disabled. The FIDO2 key is the recovery path, not a service credential.
- Restrict the host firewall to 80/443 public, SSH only from approved management networks, and outbound HTTPS/DNS/NTP plus explicitly required backup destinations. Database, Docker API, MinIO console, and service ports remain private.
- Pin images; use independent generated application/database/object-storage secrets; rotate container logs; retain encrypted backups off-host.
- Give Plane and Frappe no AWS credentials by default. Their local MinIO and restic endpoint credentials are separate S3-compatible service credentials.
- Log SSM and IAM role activity in AWS; avoid logging activation codes, certificate private keys, database passwords, Notion tokens, or raw archive material.

## Cost guardrail

The VPS remains the fixed compute cost. SSM hybrid-node registration has no per-node fee; Session Manager is $0.05 per session and Run Command is $0.002 per invocation from 2026-09-30. IAM Roles Anywhere avoids long-lived keys but certificate lifecycle remains an operations cost. Do not add AWS Private CA without a separate cost approval.
