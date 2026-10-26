# Muse Companion contracts and permission boundary

This records the initial typed boundary for the HASHPASS Muse Companion tracked by [#455](https://github.com/hashpass-tech/hashpass.tech/issues/455) and its architecture lane [#457](https://github.com/hashpass-tech/hashpass.tech/issues/457). The shared TypeScript contracts live in `packages/types/src/companion.ts`.

## Allowed interaction tiers

| Tier | Examples | Model behavior |
| --- | --- | --- |
| Read | `get_my_events`, `get_event_details`, `get_readiness`, `show_my_original_ticket` | Return only data scoped to the active user. Keep ticket QR/pass contents out of model context unless a separately reviewed flow requires them. |
| Navigate | `navigate_to_event_or_schedule` | Return a typed in-app route intent. The client must resolve it through an allowlist; model text is never treated as a URL or executable route. |
| Propose write | `propose_import_source` | Create a reviewable proposal with source evidence. Saving requires a separate, explicit confirmation from the user and a server-validated confirmation token. |

Confirmation is deliberately not a model capability. Payment, transfer, destructive actions, organizer administration and arbitrary screen or browser automation are outside the MVP boundary. Types express the contract only; they do not implement authentication, authorization, token generation, persistence, a Meta request or a running capability registry.

## Request trust boundary

`AgentRequest`, turns and tool arguments are client/model input and must be validated at runtime. The server constructs `ActionContext` only after it authenticates the current request. A model never receives session credentials. Every data adapter must apply `ActionContext.userId` at the storage/API boundary rather than trusting a model-provided user ID. Tool results and logs must redact secrets and raw ticket QR values.

## Current verification and blockers

- Shared type package build and repository type checks cover contract consistency.
- DoorReady's first domain slice and synthetic validation fixtures are in PR #456.
- No successful Meta `muse-spark-1.3` request or Muse Voice Transcribe request has been verified. This environment has no available `MODEL_API_KEY`; a cloud environment configuration draft records the required secret/domain but still needs secure value entry and publication by the environment owner.
- Authenticated event/pass adapters, runtime schemas, confirmation-token storage, voice UI, offline behavior and an end-to-end demo remain unimplemented.
- No production attendee data was sent to a model and no deployment was made.
