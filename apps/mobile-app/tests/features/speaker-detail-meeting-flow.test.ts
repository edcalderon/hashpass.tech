/// <reference types="jest" />

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(
  resolve(__dirname, "../../app/events/[eventSlug]/speakers/[id].tsx"),
  "utf8",
);
const myRequestsSource = readFileSync(
  resolve(__dirname, "../../app/events/[eventSlug]/networking/my-requests.tsx"),
  "utf8",
);

describe("speaker detail meeting lifecycle", () => {
  it("uses the authenticated meeting-request boundary and requires a slot to accept", () => {
    expect(source).toContain("apiClient.request(meetingRequestSlotsPath");
    expect(source).toContain("action: 'accept'");
    expect(source).toContain("action: 'decline'");
    expect(source).toContain("action: 'block'");
    expect(source).toContain("action: 'cancel'");
    expect(source).not.toContain(".rpc('accept_meeting_request'");
    expect(source).not.toContain(".rpc('decline_meeting_request'");
    expect(source).not.toContain(".rpc('block_user_and_decline_request'");
    expect(source).not.toContain(".rpc('cancel_meeting_request'");
  });

  it("shows a speaker's incoming requests on their own detail view", () => {
    expect(source).not.toContain("meetingRequests.length > 0 && !isCurrentUserSpeaker");
  });

  it("uses the same authenticated boundary when blocking from the requests inbox", () => {
    expect(myRequestsSource).toContain("action: 'block'");
    expect(myRequestsSource).not.toContain(".rpc('block_user_and_decline_request'");
  });

  it("uses the event-scoped route instead of inheriting the BSL API segment", () => {
    expect(source).toContain("eventApiPath(eventId, 'meetings/requests')");
    expect(myRequestsSource).toContain("eventApiPath(eventId, 'meetings/requests')");
    expect(source).not.toContain('apiSegment');
    expect(myRequestsSource).not.toContain('apiSegment');
  });

  it("keeps meeting updates behind the event API instead of a second client database channel", () => {
    expect(source).toContain("loadMeetingRequestStatus");
    expect(source).toContain("setInterval(refresh, 30000)");
    expect(source).not.toContain("postgres_changes");
    expect(source).not.toContain("supabase.channel");
  });

  it("opens the request form without emitting modal debug logs", () => {
    expect(source).not.toContain("handleRequestMeeting called");
    expect(source).not.toContain("Showing meeting request modal");
    expect(source).not.toContain("Modal should now be visible");
  });
});
