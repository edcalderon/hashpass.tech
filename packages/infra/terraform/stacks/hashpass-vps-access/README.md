# Hashpass VPS AWS access adapter

This stack does not create a VPS. It creates the AWS-side identities for an already-hardened, provider-neutral VPS:

- one expiring SSM Hybrid Activation and its `AmazonSSMManagedInstanceCore` managed-node role;
- one IAM Roles Anywhere trust anchor, profile, and least-privilege workload role.

The activation values are sensitive Terraform outputs. Use them once with `ops/self-hosted/ansible/playbooks/aws-hybrid-ssm.yml`, then let the activation expire. Never copy them to Git, CI variables, or the VPS Compose `.env`.

IAM Roles Anywhere is disabled by default, so SSM can be enrolled before a workload needs AWS. The trust-anchor certificate is public CA material only. This stack deliberately does not create AWS Private CA and never accepts a CA private key. When enabled, callers must supply exact Secrets Manager, KMS, S3 bucket, and S3 object-prefix ARNs.

Validate without a backend:

```bash
pnpm infra:vps-access:validate
```

For plan/apply, `packages/infra/terraform/scripts/stack.sh` forces
`AWS_PROFILE=hashpass` and derives the encrypted state bucket from the verified
Hashpass account. Do not invoke raw Terraform with an ambient/default profile.

Create an untracked `terraform.tfvars` for the first SSM-only activation. Set a
short UTC expiration and leave IAM Roles Anywhere disabled:

```hcl
ssm_activation_expiration_date = "YYYY-MM-DDTHH:MM:SSZ"
enable_roles_anywhere          = false
```

Plan and apply only after the host and, where applicable, the client-certificate
CN, trust anchor, and resource allowlist have been reviewed:

```bash
pnpm infra:vps-access:plan
pnpm infra:vps-access:apply
```
