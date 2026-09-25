-- V101 briefly used the umbrella `bsl` event id. The live General pass shown
-- to Colombia Blockchain Summit attendees is attached to `colombia2026`; keep
-- the campaign on that canonical event so an approval upgrades the existing
-- entitlement rather than creating a duplicate pass for the umbrella event.

BEGIN;

UPDATE public.business_invite_campaigns
SET event_id = 'colombia2026',
    label = 'BSL Colombia and Colombia Blockchain Week 2026 Business invitation',
    updated_at = now()
WHERE code_hash = encode(extensions.digest('9899', 'sha256'), 'hex');

DELETE FROM public.business_invite_campaign_events AS target
USING public.business_invite_campaigns AS campaign
WHERE target.campaign_id = campaign.id
  AND campaign.code_hash = encode(extensions.digest('9899', 'sha256'), 'hex')
  AND target.event_id NOT IN ('colombia2026', 'cbweek2026');

INSERT INTO public.business_invite_campaign_events (campaign_id, event_id)
SELECT campaign.id, targets.event_id
FROM public.business_invite_campaigns AS campaign
CROSS JOIN (VALUES ('colombia2026'::text), ('cbweek2026'::text)) AS targets(event_id)
JOIN public.events AS event
  ON event.id = targets.event_id AND event.status = 'published'
JOIN public.event_pass_tiers AS tier
  ON tier.event_id = targets.event_id AND tier.pass_type = 'business'
WHERE campaign.code_hash = encode(extensions.digest('9899', 'sha256'), 'hex')
ON CONFLICT (campaign_id, event_id) DO NOTHING;

COMMIT;
