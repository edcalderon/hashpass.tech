-- Test create_default_pass for provided user and verify inserts
\echo 'Running create_default_pass for user 4105b97f-928f-4155-9472-ef8942b8f3da'
SELECT create_default_pass('4105b97f-928f-4155-9472-ef8942b8f3da'::uuid, 'general') AS pass_id;

\echo 'Passes for user'
SELECT id, user_id, event_id, pass_type, status, created_at
FROM public.passes
WHERE user_id = '4105b97f-928f-4155-9472-ef8942b8f3da'
ORDER BY created_at DESC
LIMIT 5;

\echo 'Pass request limits for user'
SELECT id, pass_id, user_id, remaining_meeting_requests, remaining_boost_amount, last_reset_at
FROM public.pass_request_limits
WHERE user_id = '4105b97f-928f-4155-9472-ef8942b8f3da'::uuid
ORDER BY last_reset_at DESC
LIMIT 5;
