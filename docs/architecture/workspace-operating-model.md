# HASHPASS workspace operating model

**Date:** 2026-10-27  
**Status:** Adopted and reconciled  
**Canonical decisions:** [ADR-ORG-001](adr-company-knowledge-system.md) and [ADR-ORG-002](adr-institutional-reconciliation.md)

HASHPASS uses four complementary systems. Each system has a bounded authority; no system is a universal mirror of the others.

| System | Canonical authority | Use it for | Do not use it for |
| --- | --- | --- | --- |
| **GitHub** | Engineering execution and technical history | Project #4, issues, PRs, code, tests, releases, implementation ADRs and deployment evidence | Corporate legal/financial archive, private drafts or secrets |
| **Plane** | Institutional company memory and archive index | Approved decisions, operational knowledge, evidence indexes and non-code management | Duplicate GitHub issues or unreviewed private hypotheses |
| **Google Drive** | Original evidence | Contracts, legal, financial, investment and commercial source documents and the Institutional KMS & Source Register | Task tracking or copied replacements for originals |
| **Notion** | Private CEO strategy and drafts | Ideas, hypotheses, private founder decisions and executive planning | Engineering dependencies, permanent technical archive or a second task system |

## Classification rule

1. Code, configuration, infrastructure, tests, releases or deployment work → GitHub Project [#4 HASHPASS](https://github.com/orgs/hashpass-tech/projects/4).
2. Original contract, financial, legal, investment or commercial evidence → Google Drive and its source register.
3. Approved company decision, operating fact, evidence index or non-code work → the appropriate Plane module/page.
4. Private CEO exploration or an unreviewed hypothesis → Notion.

An index may link to a source, but it must not become a second copy of the source. Agents must preserve the source URL or commit/PR, owner, date, status and uncertainty. Unknown facts stay marked as unresolved.

## Reconciled institutional state

The 2026-10-27 update preserved the existing company work:

- Plane has **8 modules** and **9 existing work items**. The six original modules remain; **Product Strategy, AI & Identity** and **Knowledge Governance & Institutional Archive** were added.
- The three canonical Plane pages are [Knowledge Governance — Operating Model](https://work.hashpass.tech/plane/projects/8c6755ef-6d32-4076-9173-a6b06db7fc40/pages/11743486-54fd-4cc4-9c86-724326696dfd/), [Company State & Evidence Register](https://work.hashpass.tech/plane/projects/8c6755ef-6d32-4076-9173-a6b06db7fc40/pages/86da9ea3-20f9-4a0a-9207-8085c6bd2c64/) and [Product & Engineering Knowledge Index](https://work.hashpass.tech/plane/projects/8c6755ef-6d32-4076-9173-a6b06db7fc40/pages/cb81c8be-2dc2-422c-9d8b-277fedfbc2dc/). The [Mission Command Center](https://work.hashpass.tech/plane/projects/8c6755ef-6d32-4076-9173-a6b06db7fc40/pages/1016c8e8-adaa-41b3-aaff-094c54e0740d/) links these indexes.
- The [Notion CEO HQ](https://app.notion.com/p/3d00738d2ce6818780f2cabd380a70fc) remains private, with original planning history preserved.
- The [Institutional KMS & Source Register](https://docs.google.com/document/d/1cD9cCIXtMmVA9hMH42ZhUvkwsp9_I7SaQiKpNy--Khs/edit) links original Drive evidence without relocating or overwriting it.
- GitHub Project #4 remains the engineering execution authority. This documentation update creates no duplicate engineering board or task set.

These are navigation and provenance links. They do not grant an agent access or permission to write.

## Reconciliation flow

```text
Drive originals + merged GitHub changes + verified releases/deployments
                              ↓
                 review, classify, preserve provenance
                              ↓
             Plane institutional pages / evidence register
                              ↓
              concise CEO context and next decisions in Notion
```

This is a deliberate review workflow, not an automatic integration. Read back Plane writes before reporting them as published, and never copy secrets or private archive content into the repository.

## Remaining reconciliation

- Verify paid contracts, current banking/tax obligations and production deployment evidence against primary records.
- Resolve the Companion distinction between guest-first access and authenticated fleet ownership through the existing GitHub engineering scope.
- Define the owner, cadence and dry-run report for recurring reconciliation. Any automation must satisfy ADR-ORG-002 and must remain idempotent without creating duplicate tasks.
