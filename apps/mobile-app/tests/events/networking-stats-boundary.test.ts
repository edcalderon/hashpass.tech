/// <reference types="jest" />

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(
  resolve(__dirname, "../../app/events/[eventSlug]/networking/index.tsx"),
  "utf8",
);

describe("networking dashboard stats boundary", () => {
  it("loads event-scoped networking stats through the authenticated API client", () => {
    expect(source).toContain("eventApiPath(eventId, 'networking/stats')");
    expect(source).toContain('apiClient.request(networkingStatsPath');
  });

  it("does not query Supabase RPC or speaker tables from the browser", () => {
    expect(source).not.toContain(".rpc('get_user_meeting_request_counts'");
    expect(source).not.toContain(".from('bsl_speakers')");
  });
});
