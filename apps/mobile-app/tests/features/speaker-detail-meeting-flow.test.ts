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
    expect(source).toContain("apiClient.request('meeting-requests/slots'");
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
});
