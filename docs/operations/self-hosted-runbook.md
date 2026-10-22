# Operator runbook: Hashpass Plane, Frappe, and AWS access

This runbook applies the approved Plane Community + Frappe Helpdesk baseline. It is deliberately provider-neutral at the host layer and uses AWS only for the Notion archive, Systems Manager control plane, and an opt-in workload identity.

## Access state

The VPS accepts only the verified FIDO2 administrator key. Root SSH, password SSH, keyboard-interactive SSH, and the bootstrap key are disabled. Do not restore any of them for automation.

Before any AWS mutation, verify the local `hashpass` profile resolves to the intended private account without printing account data. Do not use the legacy `default` profile.

## 1. Create reviewed AWS access resources

The stack requires explicit inputs for the SSM expiry, trust-anchor certificate, certificate CN, and every permitted secret/KMS/S3 ARN. It intentionally has no wildcard or default runtime access.

```bash
./packages/infra/terraform/scripts/stack.sh hashpass-vps-access validate
./packages/infra/terraform/scripts/stack.sh hashpass-vps-access plan
```

Review the plan for exactly one Hybrid Activation, one SSM managed-node role, one Roles Anywhere trust anchor, one profile, and one workload role. Apply only after the CA and resource allowlist have been approved. Treat the resulting activation code and ID as one-time secrets.

## 2. Enroll the host in SSM Hybrid

Use `ops/self-hosted/ansible/playbooks/aws-hybrid-ssm.yml` with a one-node, short-expiry activation. Supply `ssm_activation_code`, `ssm_activation_id`, and `ssm_region` through a secure operator channel. Do not put them in inventory, the VPS `.env`, a shell history, CI, or Git. When the FIDO2 key requires a PIN, run the local operator helper from a real terminal instead:

```bash
SSH_FIDO_KEY_PATH=/path/to/hashpass-ovh-ops-sk \
bash ops/self-hosted/scripts/register-ssm-hybrid.sh
```

The helper reads the activation from encrypted remote Terraform state and streams it directly to the VPS. Enter the PIN only into the local hardware-key prompt; never share it with an agent or paste it into a shell variable.

Verify the node appears in Systems Manager with the expected Hashpass tags. Test a harmless approved Run Command, then expire/delete the unused activation. The SSM role must have only `AmazonSSMManagedInstanceCore`.

## 3. Configure a workload identity only when required

If a named workload needs AWS, use `ops/self-hosted/ansible/playbooks/aws-roles-anywhere.yml`. Verify the helper binary source and checksum before placing it on the host. Provide:

- `aws_signing_helper_path`
- client certificate and root-owned private-key paths
- trust-anchor ARN, profile ARN, and workload role ARN

The playbook writes a `credential_process` profile. It does not distribute a CA private key and does not use static AWS keys. Test that the credential is temporary, has the expected role identity, can access only its allowlisted resources, and is denied on a neighboring secret or bucket.

## 4. Deploy the services

1. Copy `ops/self-hosted/.env.example` to an untracked host `.env` with mode `0600` and replace all placeholders.
2. Keep `OBJECT_STORAGE_*` and `BACKUP_S3_*` scoped to their S3-compatible endpoints. They are not AWS IAM credentials.
3. Validate all Compose files and deploy only pinned images:

   ```bash
   cd ops/self-hosted
   ./deploy.sh
   ```

4. Confirm only Caddy exposes HTTP/HTTPS; Plane/Frappe databases, queues, MinIO, and Docker remain private.
5. Run a Plane work-item smoke test, a Frappe ticket smoke test, and a backup/isolated-restore drill before public DNS cutover.

## 5. Notion archive gate

The deployed synchronizer uses its own read-only Notion integration shared only with the Hashpass CEO HQ root. It archives every page/block tree before writing any Plane work item and keeps Notion -> Plane one-way. Keep attachment handling, deletion reconciliation, and scheduled materialization disabled until drills pass.

## Incident response

- Human access: use the FIDO2 key. Do not weaken SSH to recover convenience access.
- Host compromise: revoke the Roles Anywhere certificate, disable its profile/role, invalidate application secrets, rotate S3-compatible backup/object-store credentials, rebuild the host from IaC, and restore only verified data.
- Lost FIDO2 key: use the separate documented provider-console recovery process, rebuild access with a replacement hardware key, and audit the SSM/SSH logs. Do not enable permanent password SSH.
- SSM compromise: deregister the node, revoke CI/operator permission to Session Manager and Run Command, create a new one-node activation, and re-enroll after host review.
