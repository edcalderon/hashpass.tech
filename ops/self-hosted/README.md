# HASHPASS self-hosted operations

These are portable templates for a Plane Community and Frappe Helpdesk deployment. Set all domains, secrets, backup endpoints, and access controls in a private operator environment before deployment.

The public subset deliberately excludes host-access automation, cloud identity configuration, business data, live topology, and operational runbooks. `plane/compose.yaml`, `frappe/compose.yaml`, Caddy, backup scripts, and the environment template remain here so compatible systems can validate the container contract without learning Hashpass production details.
