# HASHPASS Frappe Helpdesk MCP

A deliberately narrow stdio MCP facade over Frappe's authenticated REST API. It exposes the fourteen approved support operations only. Read and write identities are separate; write tools require both `FRAPPE_MCP_MODE=write` and `FRAPPE_MCP_ALLOW_WRITES=true`. Never grant either user System Manager or Administrator.

Create two Frappe service users. Give the reader read access to `HD Article`, `HD Ticket`, and `Contact`; give the writer only the ticket/comment create and ticket update/assign permissions required by the enabled tools. Run separate MCP processes for read and write clients, and do not place credentials in MCP client JSON—inject them from the host secret manager.
