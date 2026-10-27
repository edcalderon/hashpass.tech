# HASHPASS institutional knowledge center — as built

**Date:** 2026-10-27
**Status:** Current operating state recorded from the cross-platform reconciliation
**Canonical decisions:** [ADR-ORG-001](adr-company-knowledge-system.md) and [ADR-ORG-002](adr-institutional-reconciliation.md)

## Authority map

| System | Current role | Boundary |
| --- | --- | --- |
| [GitHub Project #4](https://github.com/orgs/hashpass-tech/projects/4) | Engineering execution: issues, code, PRs, tests and releases | Does not replace the corporate evidence archive |
| [Plane](https://work.hashpass.tech) | Institutional source of truth: approved company memory, decisions, operational knowledge, evidence index and non-code management | Does not duplicate GitHub issues or private drafts |
| [Google Drive source register](https://docs.google.com/document/d/1cD9cCIXtMmVA9hMH42ZhUvkwsp9_I7SaQiKpNy--Khs/edit) | Index of original legal, financial, investment and commercial evidence | Originals remain in Drive |
| [Notion CEO HQ](https://app.notion.com/p/3d00738d2ce6818780f2cabd380a70fc) | Private CEO strategy, hypotheses and drafts | Not an engineering dependency or permanent technical archive |

## Plane state

The reconciliation preserved **8 modules** and **9 existing work items**:

- six original modules retained;
- **Product Strategy, AI & Identity** added;
- **Knowledge Governance & Institutional Archive** added;
- three canonical knowledge pages published and verified;
- the Mission Command Center links the institutional indexes.

Canonical pages:

- [Knowledge Governance — Operating Model](https://work.hashpass.tech/plane/projects/8c6755ef-6d32-4076-9173-a6b06db7fc40/pages/11743486-54fd-4cc4-9c86-724326696dfd/)
- [Company State & Evidence Register](https://work.hashpass.tech/plane/projects/8c6755ef-6d32-4076-9173-a6b06db7fc40/pages/86da9ea3-20f9-4a0a-9207-8085c6bd2c64/)
- [Product & Engineering Knowledge Index](https://work.hashpass.tech/plane/projects/8c6755ef-6d32-4076-9173-a6b06db7fc40/pages/cb81c8be-2dc2-422c-9d8b-277fedfbc2dc/)
- [Mission Command Center](https://work.hashpass.tech/plane/projects/8c6755ef-6d32-4076-9173-a6b06db7fc40/pages/1016c8e8-adaa-41b3-aaff-094c54e0740d/)

The links above are the supplied reconciliation record. Agents must still read back any new Plane page before claiming a later publication.

## Repository boundaries

- `docs/architecture/` contains reviewable decisions and source-linked institutional documentation.
- GitHub issues and PRs remain the only engineering execution queue.
- `docs/operations/` describes infrastructure, not authority to synchronize corporate knowledge.
- The legacy Notion archive package is optional historical infrastructure; it is not the current institutional source register and must remain disabled until a reviewed design satisfies ADR-ORG-002.

## Reconciliation status

The structure is established, but the knowledge base is not fully reconciled. Open evidence work covers paid contracts, banking/tax obligations and production deployment proof. The Companion guest-first versus authenticated fleet-ownership distinction also needs engineering validation. Recurring reconciliation is intentionally not automatic yet; its owner, cadence and dry-run report remain to be defined.

No duplicate GitHub engineering tasks were created by this documentation update.
