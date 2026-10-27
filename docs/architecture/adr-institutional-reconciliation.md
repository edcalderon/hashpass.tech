# ADR-ORG-002 — Evidence-based institutional reconciliation

**Date:** 2026-10-27  
**Status:** Accepted process; implementation pending  
**Owner:** CEO / operations / engineering  
**Related:** [ADR-ORG-001](adr-company-knowledge-system.md)

## Context

Company knowledge changes in different systems and at different speeds. GitHub records engineering execution, Google Drive contains original legal/financial/commercial evidence, Plane contains approved institutional memory, and Notion contains private CEO planning. A blind mirror would duplicate tasks, leak private material and make stale summaries look authoritative.

## Decision

HASHPASS will use a recurring, evidence-based reconciliation process. The process is a review workflow, not an always-on synchronization job.

### Inputs

- merged GitHub PRs, releases, issue decisions and verified deployment evidence;
- original documents and source-register entries in Google Drive;
- current Plane modules, institutional pages and evidence register;
- Notion context only when the CEO explicitly authorizes its use and the relevant decision has been reviewed.

### Steps

1. **Collect:** identify changed decisions, verified outcomes, new source documents and unresolved claims.
2. **Classify:** determine whether each item is engineering execution, original evidence, approved institutional knowledge, non-code work or private draft material.
3. **Verify:** check the primary source, owner, date, status and scope. Mark unknown or unverified facts instead of filling gaps from memory.
4. **Curate:** update the existing Plane page/module or source-register entry. Preserve the prior version and link to the GitHub commit/PR or Drive original.
5. **Summarize:** put only the concise CEO-facing decision, risk or ask in Notion, with links back to Plane/GitHub/Drive.
6. **Report:** record what changed, what remains unresolved and which systems were intentionally not modified.

### Invariants

- Never create a Plane work item merely to mirror a GitHub issue or PR.
- Never copy a Drive original into Git or Plane when a link and evidence index entry are sufficient.
- Never treat a Notion hypothesis as an approved company fact.
- Never claim a page, deployment, contract or financial fact is verified without read-back or primary evidence.
- Never put secrets, credentials, raw private archive content or personal data into reconciliation notes.
- Never let an agent-generated summary overwrite a source record; summaries are projections with provenance.

## Current gaps

The institutional structure is established, but the following remain reconciliation work rather than completed facts:

- paid contracts and commercial commitments;
- current banking and tax obligations;
- production deployment evidence;
- integrated behavior of guest-first Companion access versus authenticated Companion fleet ownership.

## Acceptance evidence for a future implementation

An implementation is ready for adoption when it can produce a dry-run report showing source links, changed Plane records, skipped private material, unresolved claims and an idempotent second run. It must not create duplicate GitHub issues, duplicate Plane work items or unlinked evidence copies.
