# ADR-ORG-001 — Company knowledge system and source-of-truth boundaries

**Date:** 2026-10-27  
**Status:** Accepted operating model  
**Owners:** CEO / engineering lead  
**Supersedes:** the authority split in [ADR-HMC-003](knowledge-governance-github-plane-notion.md) where it conflicts with this decision

## Decision

HASHPASS uses four complementary systems. No system is a universal copy of the others.

| System | Canonical responsibility | Examples | Must not become |
| --- | --- | --- | --- |
| **Plane** | Institutional company knowledge, approved decisions, operational knowledge, archive index and non-code management | Curated ADR pages, company state, evidence index, legal/finance/partnership/validation work | A duplicate GitHub engineering board or a store for unreviewed private drafts |
| **GitHub** | Engineering execution and versioned technical history | Project #4, issues, PRs, code, tests, releases, implementation ADR drafts and deployment evidence | The corporate legal/finance archive or a secret store |
| **Google Drive** | Original documents and evidence | Contracts, financial/legal records, investment/commercial source material and the institutional source register | A task tracker or a replacement for source documents with copied summaries |
| **Notion** | Private CEO strategy and drafts | Ideas, hypotheses, founder planning, private decisions and executive briefs | A dependency for engineering, a permanent technical archive or a second task system |

Plane is the institutional index and approved-memory layer. Google Drive remains authoritative for original evidence. GitHub remains authoritative for engineering execution. Notion remains private and non-authoritative until a decision is reviewed and recorded in the appropriate canonical system.

## Classification rule

Before creating or updating a record:

1. If it changes code, configuration, infrastructure or a release, create or update the GitHub issue/PR in the single org Project [#4 HASHPASS](https://github.com/orgs/hashpass-tech/projects/4).
2. If it is an original contract, financial, legal, investment or commercial artifact, keep it in Google Drive and link it from the source register.
3. If it is an approved company decision, operating fact, evidence index or non-code work item, update the appropriate Plane module/page and preserve source links.
4. If it is private CEO exploration or an unreviewed hypothesis, keep it in Notion. Do not make other systems depend on it until reviewed.

Do not create duplicate engineering tasks in Plane or duplicate original evidence in GitHub. A Plane page may index a GitHub PR or a Drive document; an index is not a second source.

## Current institutional state

The 2026-10-27 cross-platform reconciliation preserved the existing company work:

- Plane has **8 modules** and **9 existing work items**. The six original modules were retained and Product Strategy, AI & Identity plus Knowledge Governance & Institutional Archive were added.
- Three canonical knowledge pages were published and verified: [Knowledge Governance — Operating Model](https://work.hashpass.tech/plane/projects/8c6755ef-6d32-4076-9173-a6b06db7fc40/pages/11743486-54fd-4cc4-9c86-724326696dfd/), [Company State & Evidence Register](https://work.hashpass.tech/plane/projects/8c6755ef-6d32-4076-9173-a6b06db7fc40/pages/86da9ea3-20f9-4a0a-9207-8085c6bd2c64/), and [Product & Engineering Knowledge Index](https://work.hashpass.tech/plane/projects/8c6755ef-6d32-4076-9173-a6b06db7fc40/pages/cb81c8be-2dc2-422c-9d8b-277fedfbc2dc/).
- The [Mission Command Center](https://work.hashpass.tech/plane/projects/8c6755ef-6d32-4076-9173-a6b06db7fc40/pages/1016c8e8-adaa-41b3-aaff-094c54e0740d/) links the institutional indexes.
- The [CEO HQ](https://app.notion.com/p/3d00738d2ce6818780f2cabd380a70fc) remains the private strategy and drafts workspace; its original planning context is preserved.
- The [Institutional KMS & Source Register](https://docs.google.com/document/d/1cD9cCIXtMmVA9hMH42ZhUvkwsp9_I7SaQiKpNy--Khs/edit) indexes original Drive evidence without relocating or overwriting it.

These links are navigation and provenance. They do not grant an agent permission to read private content or perform writes.

## Reconciliation lifecycle

The approved flow is evidence-based and recurring, but **not an automatic integration**:

```text
Drive originals + merged GitHub changes + verified releases/deployments
                              ↓
                 review, classify, preserve provenance
                              ↓
             Plane institutional pages / evidence register
                              ↓
              concise CEO context and next decisions in Notion
```

Every update should record the source URL or commit/PR, the verification date, the owner, the decision status and any unresolved uncertainty. A GitHub issue closes because its engineering acceptance evidence is complete, not because a Plane page was updated.

## Consequences

- Agents have one clear destination for each kind of work and can follow links without copying whole datasets.
- Plane becomes the durable organizational memory and archive index while GitHub remains fast and reviewable for implementation.
- Original documents remain in Drive, reducing uncontrolled copies of sensitive evidence.
- Notion can remain useful for founder thinking without becoming an undocumented dependency.
- A recurring reconciliation process is required; until implemented, updates are deliberate and manually verified.

## Open follow-ups

- Reconcile paid contracts, current banking/tax obligations and production deployment evidence against original sources.
- Resolve the Companion distinction between guest-first access and authenticated fleet ownership through engineering validation in the existing GitHub scope.
- Define the operator, cadence and evidence report for recurring reconciliation; do not create a duplicate project or automatic sync without a reviewed design.
