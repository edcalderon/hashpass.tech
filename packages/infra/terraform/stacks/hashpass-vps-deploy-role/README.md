# Hashpass VPS GitHub deployment role

This stack creates the dedicated GitHub OIDC role used by the production
self-hosted deployment workflow. Its trust policy accepts only the
`hashpass-tech/hashpass.tech` production environment, and its SSM policy can
send `AWS-RunShellScript` only to the private managed-node ID supplied at apply
time.

Initialize it with the Hashpass production state bucket and a dedicated state
key, then pass `ssm_managed_instance_id` through a private variable or CLI
argument. Do not commit the node ID or account ID.
