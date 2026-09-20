# Local AI context and routing

Verified 2026-09-19. Local configuration changes are outside this repository.

## Claude Code

The failing session repeatedly compacted to about 5–8K conversation tokens,
then returned to roughly 170K total input tokens on the next request, even
after small tool results. Its gateway requests included connected-app MCP
tools. A large persistent tool/instruction baseline was the main finding;
the conversation summary alone did not represent the full request size.

The local Claude settings now enable `ENABLE_TOOL_SEARCH=true`. Claude Code
otherwise loads MCP definitions eagerly on custom gateway URLs. The current
OmniRoute Claude route passed a two-turn ToolSearch smoke test. Its requests
used roughly 39–41K input tokens each. This is a diagnostic comparison, not a
same-task benchmark or a claim of equivalent billing savings.

The default effort is now `medium`; select higher effort for difficult work.
Historical project fixes were moved to `docs/agent-history.md`, and the
incorrect instruction to repeatedly compact the conversation using Headroom
was removed. Standalone Headroom compresses a supplied payload; it cannot
delete earlier Claude Code messages.

After restarting Claude Code:

1. Save a short handoff from an already-thrashing session and start fresh.
2. Check `/context` for the persistent baseline and loaded MCP tools.
3. Use bounded graph searches and file ranges. Save verbose command output
   locally and return only the relevant failures.
4. Use native `/compact` for a continuing task and `/clear` between unrelated
   tasks. Do not repeatedly force compaction to compensate for a huge baseline.
5. Compare `/usage` and the provider's actual usage for completed tasks. Cached
   input, cache writes, reasoning, retries, and extra turns all affect cost.

Tool search must be supported by any future gateway/fallback route. If a
fallback rejects `tool_reference`, use a compatible route or reduce the active
MCP set; do not assume every non-Claude fallback supports the same protocol.

## OpenCode and OmniRoute

OpenCode was updated from 1.3.13 to 1.18.31 and OmniRoute from 3.8.49 to
3.8.50. The router service now uses the installed Node 24 runtime.

OpenCode uses the bundled OmniRoute plugin and its live model catalog. The
previous 960-model static configuration was removed; the existing router key
was transferred to OpenCode's private credential store. The default is:

```text
opencode-omniroute/opencode-go/qwen3.6-plus
```

A normal OpenCode invocation, without a model override, returned `OK` through
OmniRoute. `oh-my-openagent` was disabled because its primary and auxiliary
agents selected direct providers independently of the configured default.
The native `build` agent is the default. Existing backups retain the old setup.

The Zen Muse route returned HTTP 402 for insufficient account funds. Changing
headers cannot fix that account condition. The configured Go route succeeded.
The free DeepSeek diagnostic reached the upstream service, which returned
`Model is unavailable` rather than the original client-restriction error.
Free-model availability was therefore not verified.
Use the actual OpenCode client through the plugin; do not invent client
identity headers for console probes. Preserve stable session headers through
any additional proxy.

## Jev and additional compression

Jev returns typed decisions such as classifications and scores. It can be
useful for routing or ranking candidate context, but does not generate code
and is not a drop-in Claude Code compactor. Adding another model/hook brings
its own requests and latency. Measure completed-task cost and correctness
before enabling such a layer. No Jev integration was installed.

References:

- [Claude environment variables](https://code.claude.com/docs/en/env-vars)
- [Claude cost management](https://code.claude.com/docs/en/costs)
- [OmniRoute OpenCode plugin](https://github.com/diegosouzapw/OmniRoute/tree/main/%40omniroute/opencode-plugin)
- [OpenCode Go client requirements](https://opencode.ai/docs/go/#where-can-i-use-it)
- [TypeSafe's Jev introduction](https://typesafe.ai/blog/introducing-system-one-models-and-jev)
