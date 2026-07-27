import type { NetworkingStats } from '@/types/networking';

// Row shape returned by the get_user_meeting_request_counts RPC. All fields
// are optional because the caller degrades a missing/undefined row to `{}`
// rather than treating it as a hard failure -- see the .single()/resolvedStats
// comment at the call site in app/events/[eventSlug]/networking/index.tsx.
export interface RawNetworkingStatsRow {
  total_requests?: number | null;
  pending_requests?: number | null;
  accepted_requests?: number | null;
  approved_requests?: number | null;
  declined_requests?: number | null;
  cancelled_requests?: number | null;
}

// Builds the display-ready NetworkingStats from the raw RPC row (or `{}` when
// no row came back) plus the separately-fetched speaker block count. Pulled
// out of loadNetworkingStats() as a pure function so the accepted/approved
// legacy-state merge and the 0/?? fallback rules can be unit tested without
// mounting the whole networking screen.
export function resolveNetworkingStats(
  rawStats: RawNetworkingStatsRow | null | undefined,
  blockedUsers: number
): NetworkingStats {
  const stats = rawStats || {};

  // Accept both legacy `accepted` and current `approved` request states.
  const scheduledMeetings = stats.approved_requests || stats.accepted_requests || 0;
  const acceptedRequests = stats.accepted_requests || stats.approved_requests || 0;

  return {
    totalRequests: stats.total_requests || 0,
    pendingRequests: stats.pending_requests ?? 0,
    acceptedRequests,
    declinedRequests: stats.declined_requests ?? 0,
    cancelledRequests: stats.cancelled_requests ?? 0,
    blockedUsers,
    scheduledMeetings,
  };
}
