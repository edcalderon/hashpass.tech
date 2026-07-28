# DEPRECATED — do not apply

This stack's state tracks the **old source AWS account (`058264267235`)**,
part of the account migration documented in
`apps/docs/docs/infra/migrations/aws-account-cutover.md` and
`.agents/active/task-aws-account-migration.md`.

The real, currently-active Android release runner lives in
`packages/infra/terraform/stacks/mobile-release-target` (account
`952191196420`, instance confirmed live and building releases as of
2026-07-28). This directory's own `aws_instance.runner` (`i-0a2e763270ffd2b62`)
is a different, separate instance in the old account and is very likely
orphaned/idle — nobody has credentials for that account configured in this
repo's `.env` or AWS CLI profiles, so its actual status hasn't been verified.

**Do not run `terraform plan`/`apply` against this stack.** The default AWS
provider credentials in any normal shell now resolve to the *target* account
(`952191196420`, per `AWS_TARGET_ACCOUNT_ID` in the repo-root `.env`), not the
account this state file describes — so `apply` would not modify the old
account's real resources at all. It would instead try to create a brand new,
disconnected duplicate VPC/subnet/security-group/instance stack in the
*target* account, next to the real one, since Terraform can't read the
old-account resources from state to reconcile against and concludes they need
to be created fresh. Confirmed this exact failure mode on 2026-07-28.

To actually inspect or decommission the real old-account resources, someone
needs valid AWS credentials for account `058264267235` specifically — none
exist in this repo currently.
