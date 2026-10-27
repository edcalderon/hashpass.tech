# Workspace operating model: GitHub code, Plane non-code, Notion CEO drafts

**Priority:** Medium
**Status:** Rules documented 2026-10-27 (`docs/architecture/workspace-operating-model.md`, `CLAUDE.md`, `AGENTS.md`). Plane pages not yet published.
**Owner:** @edcalderon

Do not restate the rules here; the operating-model document is the single source.

## Open

- [ ] Rotate `PLANE_API_TOKEN` and `OPENAI_TUNNEL_CONTROL_PLANE_API_KEY` (both were printed in a terminal on 2026-10-27).
- [ ] Confirm `PLANE_WORKSPACE_SLUG=plane` in `/opt/hashpass/mcp/secrets/plane.env` on the host and restart the gateway; then test a real ChatGPT connection with plugin v1.0.4. Not verifiable from the repo.
- [ ] Publish the Plane pages: run `node packages/tools/scripts/build-plane-pages.mjs`, paste each `dist/plane-pages/*.md` through the Plane UI (or MCP `page` tools), read each page back, and record it in the publication log of `docs/architecture/knowledge-center-as-built.md`. Pages 03, 07 and 08 have no source yet.
- [ ] Decide whether the six Plane modules stay as the page areas.
- [ ] Re-sync Plane item text: the restored items still end with the old "Plane is the shared execution layer" line.
- [ ] Future, not built: one-way GitHub to Plane knowledge mirror (design in the as-built document).
