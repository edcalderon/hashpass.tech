/// <reference types="jest" />

import { resolveNetworkingStats } from '../../lib/networking-stats';

describe('resolveNetworkingStats', () => {
  it('zeroes out every field when the RPC row is missing entirely', () => {
    expect(resolveNetworkingStats(null, 0)).toEqual({
      totalRequests: 0,
      pendingRequests: 0,
      acceptedRequests: 0,
      declinedRequests: 0,
      cancelledRequests: 0,
      blockedUsers: 0,
      scheduledMeetings: 0,
    });

    expect(resolveNetworkingStats(undefined, 0)).toEqual({
      totalRequests: 0,
      pendingRequests: 0,
      acceptedRequests: 0,
      declinedRequests: 0,
      cancelledRequests: 0,
      blockedUsers: 0,
      scheduledMeetings: 0,
    });
  });

  it('maps every RPC field through to its display field', () => {
    const result = resolveNetworkingStats(
      {
        total_requests: 12,
        pending_requests: 3,
        accepted_requests: 5,
        declined_requests: 2,
        cancelled_requests: 2,
      },
      4
    );

    expect(result).toEqual({
      totalRequests: 12,
      pendingRequests: 3,
      acceptedRequests: 5,
      declinedRequests: 2,
      cancelledRequests: 2,
      blockedUsers: 4,
      scheduledMeetings: 5,
    });
  });

  it('prefers approved_requests over accepted_requests for scheduledMeetings (current state wins)', () => {
    const result = resolveNetworkingStats(
      { approved_requests: 7, accepted_requests: 5 },
      0
    );
    expect(result.scheduledMeetings).toBe(7);
  });

  it('falls back to accepted_requests when approved_requests is absent (legacy rows)', () => {
    const result = resolveNetworkingStats({ accepted_requests: 5 }, 0);
    expect(result.scheduledMeetings).toBe(5);
  });

  it('prefers accepted_requests over approved_requests for the acceptedRequests field', () => {
    const result = resolveNetworkingStats(
      { approved_requests: 7, accepted_requests: 5 },
      0
    );
    expect(result.acceptedRequests).toBe(5);
  });

  it('falls back to approved_requests for acceptedRequests when accepted_requests is absent', () => {
    const result = resolveNetworkingStats({ approved_requests: 7 }, 0);
    expect(result.acceptedRequests).toBe(7);
  });

  it('treats 0 as a real value via ?? for pending/declined/cancelled, not a missing-field fallback', () => {
    const result = resolveNetworkingStats(
      { pending_requests: 0, declined_requests: 0, cancelled_requests: 0 },
      0
    );
    expect(result.pendingRequests).toBe(0);
    expect(result.declinedRequests).toBe(0);
    expect(result.cancelledRequests).toBe(0);
  });

  it('always uses the separately-supplied blockedUsers count, independent of the RPC row', () => {
    expect(resolveNetworkingStats({ total_requests: 1 }, 9).blockedUsers).toBe(9);
    expect(resolveNetworkingStats(null, 9).blockedUsers).toBe(9);
  });
});
