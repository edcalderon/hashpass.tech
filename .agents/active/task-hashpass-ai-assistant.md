# Task: HashPass AI Assistant Platform

**Status:** 🟡 Planning / not started  
**Priority:** High  
**App:** HashPass mobile app + web app  
**Created:** 2026-07-04  
**Updated:** 2026-07-04

## Goal

Build an app-wide AI assistant for HashPass that works across mobile and web, with:

- a floating launcher on most screens
- an expanded in-app chat panel
- a dedicated standalone assistant page for deep conversations
- secure custom APIs backed by Amazon Bedrock
- a curated RAG knowledge base for HashPass, event, and blockchain questions
- persistent memory for conversations and citations

The first milestone should also cover the AWS reward checklist the user called out:

- use a foundation model in the Amazon Bedrock playground
- create an Aurora or RDS database for assistant state / retrieval storage

## AWS Reward Checklist

| Activity | Reward | Status |
|----------|--------|--------|
| Use a foundation model in the Amazon Bedrock playground | $20 | Not started |
| Create an Aurora or RDS database | $20 | Not started |

## Current Surfaces

| Surface | Current state | Notes |
|---------|---------------|-------|
| `apps/mobile-app/app/_layout.tsx` | Root shell for the Expo app | Best place for a global assistant provider and launcher mount |
| `apps/mobile-app/app/(shared)/dashboard/_layout.tsx` | Drawer shell for logged-in users | Good place for a dashboard-level launcher, quick actions, and route-aware context |
| `apps/mobile-app/app/(shared)/support.tsx` | Manual support form | Good fallback when the assistant is unsure or needs human support |
| `apps/mobile-app/app/status.tsx` | Public status page | Should expose assistant entry points for version / outage questions |
| `apps/mobile-app/components/RealtimeChat.tsx` | Meeting-specific chat | Keep separate; do not repurpose this as the AI assistant transport |
| `apps/web-app/app/layout.tsx` | Root shell for the marketing site | Best place for a persistent web assistant provider and modal mount |
| `apps/web-app/app/page.tsx` | Landing page | Good place for a floating button and contextual opener |
| `apps/web-app/app/components/Navbar.tsx` | Persistent top nav | Good place for a compact assistant trigger on desktop |
| `packages/infra/lambda/index.js` | API gateway entry point | Existing Expo Router API deployment path can host the assistant endpoints |
| `packages/infra/terraform/stacks/hashpass-api-target/main.tf` | API infrastructure | Likely place to wire new env vars for Bedrock / RDS / retrieval |

## Proposed Product Shape

### Mobile

- Floating assistant button bottom-right on authenticated screens and public screens where it makes sense
- Expanded assistant as a full-height modal or bottom sheet depending on device size
- Standalone assistant route for deep conversations and shareable links
- Route-aware prompts such as:
  - "Ask about this event"
  - "Ask about this speaker"
  - "What can I do in HashPass?"

### Web

- Persistent floating launcher on the landing page and logged-in app surfaces
- Expanded panel as a right-rail drawer on desktop and a bottom sheet on mobile web
- Standalone assistant page for long-form help and citations
- Context chips for the current page, current event, and current locale

## Core Use Cases

- Ask about event schedules, speakers, venues, and logistics
- Ask about HashPass product behavior, passes, wallet, networking, notifications, and support
- Ask about blockchain / event-industry concepts in general
- Ask about the current page or current event without manually retyping the context
- Get cited answers instead of uncited model guesses
- Escalate to support when the assistant confidence is low or the question is outside scope

## Architecture

```
Client UI (mobile/web)
  -> assistant launcher / sheet / page
  -> POST /api/assistant/chat
  -> auth + rate limit + policy check
  -> retriever over curated sources
  -> Bedrock inference
  -> citations + suggested actions + memory write
  -> Aurora/RDS for threads, summaries, and vectors
```

### API Contract

`POST /api/assistant/chat`

Request shape:

```ts
{
  message: string;
  conversationId?: string;
  route?: string;
  eventId?: string;
  locale?: string;
  context?: {
    pageTitle?: string;
    selectedText?: string;
    currentFeature?: string;
  };
}
```

Response shape:

```ts
{
  conversationId: string;
  answer: string;
  citations: Array<{
    sourceId: string;
    title: string;
    url?: string;
    score: number;
  }>;
  suggestedActions: Array<{
    label: string;
    route?: string;
    intent?: string;
  }>;
  confidence: number;
  needsHumanSupport: boolean;
}
```

Optional follow-up endpoints:

- `POST /api/assistant/feedback` for thumbs up / down and failure labels
- `GET /api/assistant/thread/:id` for conversation history
- `GET /api/assistant/sources` for diagnostics and admin review
- `GET /api/assistant/health` for readiness checks

## Knowledge Base

### Primary Sources

- `packages/config/src/events.ts` for structured event metadata
- Database tables for live / event-specific data:
  - `event_agenda`
  - `bsl_speakers`
  - `meeting_requests`
  - `passes`
- Public app docs in `apps/docs/docs/**`
- Public HashPass surfaces:
  - `apps/mobile-app/app/status.tsx`
  - `apps/mobile-app/app/(shared)/support.tsx`
  - `apps/web-app/app/page.tsx`
  - `apps/web-app/app/components/*`
- Curated blockchain / HashPass FAQ content maintained specifically for retrieval

### Guardrails on Sources

- Do not index build output, `.next`, or generated artifacts
- Do not use raw archived migration notes unless they are explicitly curated into the assistant corpus
- Do not use user chat history as a source of truth
- Do not expose private booking or auth data unless the user is authenticated and the answer requires it

## Security and Safety

- Authenticate the user before answering personalized questions
- Use stricter public mode on the marketing site and status page
- Rate limit by user and IP
- Treat retrieved content as untrusted input and defend against prompt injection
- Redact tokens, secrets, email bodies, phone numbers, and other sensitive values from logs
- Never send Bedrock keys, DB credentials, or session secrets to the client
- Require citations for factual answers whenever retrieval is available
- Refuse confidently when the query is out of scope instead of hallucinating
- Log model, latency, source IDs, and outcome for observability

## Data Model

Use Aurora PostgreSQL or RDS PostgreSQL as the assistant persistence layer. If possible, enable `pgvector` so the same database can store embeddings and retrieval metadata.

Suggested tables:

- `assistant_threads`
- `assistant_messages`
- `assistant_thread_summaries`
- `assistant_sources`
- `assistant_chunks`
- `assistant_feedback`

Suggested stored fields:

- user ID / guest session ID
- route context
- event ID when applicable
- locale
- source IDs and citation metadata
- model name
- token usage
- moderation / refusal flags

## Implementation Plan

1. Validate the prompt and refusal behavior in the Amazon Bedrock playground.
2. Provision Aurora or RDS for assistant memory and retrieval storage.
3. Define the source corpus and ingestion rules for event, product, support, and blockchain content.
4. Build the assistant API on the existing Expo Router / Lambda path.
5. Add the mobile launcher, expanded sheet, and standalone assistant page.
6. Add the web launcher, drawer, and standalone assistant page.
7. Wire citations, suggested actions, and "ask about this page" context.
8. Add observability, rate limiting, and redaction.
9. Test on mobile and web with event, support, and general blockchain questions.
10. Expand coverage iteratively with feedback from real usage.

## Acceptance Criteria

- The assistant is reachable from both mobile and web
- The assistant can answer event, HashPass, and general blockchain questions with citations
- The assistant has a standalone page, not only a floating panel
- The assistant backend uses Bedrock for inference
- The assistant stores conversations or summaries in Aurora / RDS
- The assistant rejects prompt injection and protects secrets
- The assistant falls back to support when the answer is out of scope
- The Bedrock playground milestone and Aurora / RDS milestone are completed

