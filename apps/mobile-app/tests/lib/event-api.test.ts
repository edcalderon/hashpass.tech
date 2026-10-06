/// <reference types="jest" />

import { eventIdFromRequest, isEventSectionPublic } from "../../lib/server/event-api";

function mockSupabase(result: { data: unknown; error: unknown }) {
  const maybeSingle = jest.fn(async () => result);
  const eq = jest.fn(() => ({ maybeSingle }));
  const select = jest.fn(() => ({ eq }));
  const from = jest.fn(() => ({ select }));
  return { from } as unknown as Parameters<typeof isEventSectionPublic>[0];
}

describe("eventIdFromRequest", () => {
  it("reads the event id from a /api/events/:eventId path", () => {
    const request = new Request("https://api.hashpass.tech/api/events/chile2026/agenda");
    expect(eventIdFromRequest(request)).toBe("chile2026");
  });

  it("returns null when the path has no events segment", () => {
    const request = new Request("https://api.hashpass.tech/api/healthcheck");
    expect(eventIdFromRequest(request)).toBeNull();
  });
});

describe("isEventSectionPublic (db/migrations/V109)", () => {
  it("returns true when the column is explicitly public", async () => {
    const supabase = mockSupabase({ data: { agenda_public: true }, error: null });
    await expect(isEventSectionPublic(supabase, "chile2026", "agenda_public")).resolves.toBe(true);
  });

  it("returns false when the column is explicitly set to not public", async () => {
    const supabase = mockSupabase({ data: { speakers_public: false }, error: null });
    await expect(isEventSectionPublic(supabase, "chile2026", "speakers_public")).resolves.toBe(false);
  });

  it("treats a legacy event with no public.events row as public", async () => {
    const supabase = mockSupabase({ data: null, error: null });
    await expect(isEventSectionPublic(supabase, "legacy-event", "agenda_public")).resolves.toBe(true);
  });

  it("fails open on a lookup error instead of hiding an actually-public section", async () => {
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined);
    const supabase = mockSupabase({ data: null, error: new Error("connection reset") });
    await expect(isEventSectionPublic(supabase, "chile2026", "speakers_public")).resolves.toBe(true);
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
