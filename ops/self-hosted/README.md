# HASHPASS self-hosted operations stack

Start with [`docs/operations/self-hosted-operations.md`](../../docs/operations/self-hosted-operations.md) and the [operator runbook](../../docs/operations/self-hosted-runbook.md). The root compose owns Caddy, `plane/compose.yaml` is the pinned official Plane CE layout with public ports removed, and `frappe/compose.yaml` runs the pinned Helpdesk image. All join the pre-created `hashpass-ops` edge network; application data services remain unexposed.
