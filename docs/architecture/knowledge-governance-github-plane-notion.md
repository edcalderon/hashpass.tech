# HASHPASS — Knowledge governance: GitHub → Plane archive, Notion transient CEO
**Date:** 2026-10-26 | **Status:** Architectural governance decision (ADR-HMC-003). **Owner:** CEO / engineering lead.

## Explicit source-of-truth split
| System | Canonical responsibility | Must NOT become |
|---|---|---|
| **GitHub** | Active engineering issues, subtask delegation, code/PR review, implementation notes, acceptance tests, deploy evidence and chronological status. Technical specifications and versioned ADR drafts live in-repo alongside code. | A secret store or marketing archive. |
| **Plane** | **Final curated architecture knowledge center**: stabilized system docs, accepted ADR snapshots, canonical designs, schema/index, vendor evaluations, privacy/security requirements, experiments, lessons learned, historical releases and hackathon postmortems. Link back to source commits/issues. | A parallel sprint tracker or duplicate GitHub issue database. |
| **Notion** | **Temporary CEO workspace**: executive briefing, funding/partner/high-level risk decisions, accepted program dates, calendar links and escalation; links to GitHub & Plane. | Permanent engineering documentation or duplicate task maintenance. |
| **Calendar** | Time-bound engineering work sessions, hard deadlines, external meetings. | Issue tracker or knowledge warehouse. |

## Lifecycle
```text
Discovery / new requirement
      ↓
GitHub issue (#455, etc.) + versioned in-repo design draft
      ↓
Implementation PR + tests + deployment proof
      ↓
Decision review (accepted/superseded/rejected)
      ↓
Plane: curated permanent architecture ADR / reference document + provenance URL
      ↓
Notion: concise CEO status + link + next business decision
      ↓
Later: update canonical ADR version in GitHub and Plane; no task duplication
```

## Documentation rule
- Draft in GitHub because documentation must move with implementation and be diff/reviewable.
- Publish **accepted** architecture into Plane with stable ID, title, owner, effective date, status, review date, GitHub source link, implementation commit/PR and supersedes/related ADR metadata.
- Avoid claiming Plane is populated until Plane tool has actually written it.
- Notion carries 1-paragraph decision summary, current gate, biggest risk and canonical links. When Plane is published, link it and stop copying long technical texts into Notion. Existing long Notion sprint entries can remain as a historical transitional log, visibly labeled superseded if needed.
- GitHub issues close based on tested functionality, not merely docs saved in Plane. Preserve chronology in issue comments, with no parallel statuses elsewhere.

## Plane knowledge taxonomy (planned; apply when access available)
- 00 — Architecture Index and Terminology
- 01 — Architecture Decision Records (ADR-HMC-001, 002, 003)
- 02 — Platform & Capability Registry
- 03 — Muse Models, Speech, Cost and Provider Benchmarks
- 04 — Event Knowledge / Agenda Intelligence
- 05 — Networking, Consent and Meeting Protocol
- 06 — Security, Privacy, Compliance and Data Retention
- 07 — Experiments and Evaluation Evidence
- 08 — Historical Hackathons, Releases and Postmortems

## Archival checklist
1. Review and merge source PR.
2. Mark ADR status accepted if implemented/reviewed; no unsupported 'completed' claims.
3. Copy cleaned/sanitized text to Plane knowledge module when connected; preserve source GitHub SHA and relevant Notion link.
4. Verify Plane page renders and links to PR/repo.
5. Put Plane permalink into GitHub ADR and Notion CEO summary; do not create Plane work items to mirror GitHub tasks.
6. On subsequent revisions, update/supersede same Plane page, keep version history.

## Current constraints
As of this documentation turn, the **$hashpass-plane** link is known from user conversation but no Plane read/write action is available in the connected tool catalog. Therefore actual Plane changes are **pending**, and this Markdown is an intentionally import-ready source. Do not claim that Plane was updated.
