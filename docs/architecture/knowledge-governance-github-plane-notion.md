# Historical ADR-HMC-003 — Knowledge governance

**Original date:** 2026-10-26
**Status:** Superseded on 2026-10-27 by [ADR-ORG-001](adr-company-knowledge-system.md) and [ADR-ORG-002](adr-institutional-reconciliation.md)

This record is retained for decision history. Its earlier GitHub → Plane → Notion framing did not fully describe Google Drive as the authority for original evidence or Plane as the institutional archive index.

## Current rule

Use the current [workspace operating model](workspace-operating-model.md):

- GitHub owns engineering execution and versioned technical history.
- Plane owns approved institutional knowledge, evidence indexes and non-code management.
- Google Drive owns original legal, financial, investment and commercial evidence.
- Notion remains the private CEO strategy and drafts workspace.

Do not create duplicate engineering tasks, duplicate source documents or automatic mirrors. Approved knowledge may link to its GitHub or Drive source while preserving provenance. Private Notion material remains non-authoritative until explicitly reviewed.

## Historical lifecycle

The original lifecycle remains useful as background:

```text
discovery → implementation/review → accepted decision → institutional curation → CEO summary
```

The current reconciliation process adds explicit source classification, primary-evidence verification, unresolved-claim tracking, idempotency and a dry-run requirement. See [ADR-ORG-002](adr-institutional-reconciliation.md).
