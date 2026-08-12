-- Drop tables confirmed dead by the 2026-08-11 schema audit
-- (apps/docs/docs/infra/DATABASE_SCHEMA.md), verified two independent ways:
-- no live code path (no direct query, no RPC reference, no trigger
-- reference) AND zero rows on every project where the table exists.
--
-- chat_messages, boost_transactions, speaker_availability,
-- speed_dating_chats: an attendee-facing speed-dating/boost feature built
-- in matchmaking.ts but never wired to any screen -- all consuming methods
-- have zero external callers. Distinct from the live, actively-used
-- meeting_chat_messages table (V053/V054 e2e encrypted meeting chat).
--
-- user_transactions: superseded by reward_transactions (V023); no
-- reader/writer anywhere. Doesn't exist on core prod at all.
--
-- subpasses: pass-system.ts's getUserSubpasses/createSubpass have zero
-- callers; never part of the canonical db/migrations series (only
-- core prod's own ad hoc history). Doesn't exist on BSL prod/dev.
--
-- wallet_auth_rate_limits: only ever created via archived/stale migration
-- copies, never the canonical db/migrations series; its only consumer
-- (lib/wallet-auth.ts) is never imported anywhere.
--
-- event_agenda_items: created by V012 (Admin Event Control Center) but
-- real agenda routes query the separate event_agenda table instead; no
-- reader/writer found for this table anywhere.
--
-- IF EXISTS handles the cross-project divergence (user_transactions isn't
-- on core prod; subpasses isn't on BSL prod/dev). CASCADE drops each
-- table's own RLS policies and the chat_messages -> speed_dating_chats FK
-- along with it; no live table or view depends on any of these eight.

DROP TABLE IF EXISTS public.chat_messages CASCADE;
DROP TABLE IF EXISTS public.speed_dating_chats CASCADE;
DROP TABLE IF EXISTS public.boost_transactions CASCADE;
DROP TABLE IF EXISTS public.speaker_availability CASCADE;
DROP TABLE IF EXISTS public.subpasses CASCADE;
DROP TABLE IF EXISTS public.wallet_auth_rate_limits CASCADE;
DROP TABLE IF EXISTS public.event_agenda_items CASCADE;
DROP TABLE IF EXISTS public.user_transactions CASCADE;

INSERT INTO hashpass_schema_migrations (id, file_path)
VALUES ('V064__drop_dead_matchmaking_and_orphaned_tables', 'db/migrations/V064__drop_dead_matchmaking_and_orphaned_tables.sql')
ON CONFLICT (id) DO NOTHING;
