/// <reference types="jest" />

const mockGetSupabaseServerForRequest = jest.fn();
const mockGetHashPokerEventConfig = jest.fn();
const mockToHashPokerEventConfig = jest.fn();

jest.mock("@/lib/supabase-server", () => ({
  getSupabaseServerForRequest: (...args: unknown[]) =>
    mockGetSupabaseServerForRequest(...args),
}));
jest.mock("@hashpass/config/ingested-event-config", () => ({
  getHashPokerEventConfig: () => mockGetHashPokerEventConfig(),
  toHashPokerEventConfig: (...args: unknown[]) => mockToHashPokerEventConfig(...args),
}));

const queryResult = (result: { data: unknown; error: unknown }) => {
  const order = jest.fn().mockResolvedValue(result);
  const eq = jest.fn(() => ({ order }));
  const select = jest.fn(() => ({ eq }));
  const from = jest.fn(() => ({ select }));
  mockGetSupabaseServerForRequest.mockReturnValue({ from });
  return { from, select, eq, order };
};

describe("/api/event-sources/hash-poker", () => {
  const originalFallback = process.env.EVENT_INGESTION_LEGACY_JSON_FALLBACK;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    delete process.env.EVENT_INGESTION_LEGACY_JSON_FALLBACK;
  });

  afterAll(() => {
    process.env.EVENT_INGESTION_LEGACY_JSON_FALLBACK = originalFallback;
  });

  const get = async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { GET } = require("../../app/api/event-sources/hash-poker+api");
    return GET(new Request("https://api.hashpass.tech/api/event-sources/hash-poker"));
  };

  it("returns the approved database configuration with cache headers", async () => {
    const payload = { id: "source-event" };
    const config = { id: "hash-poker", title: "Database tournament" };
    const query = queryResult({ data: [{ normalized_payload: payload }], error: null });
    mockToHashPokerEventConfig.mockReturnValue(config);

    const response = await get();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ data: config, source: "database" });
    expect(response.headers.get("cache-control")).toContain("stale-if-error=3600");
    expect(query.from).toHaveBeenCalledWith("published_external_events");
    expect(query.eq).toHaveBeenCalledWith("source_id", "pkrr-hash-poker");
    expect(query.order).toHaveBeenCalledWith("last_seen_at", { ascending: false });
    expect(mockToHashPokerEventConfig).toHaveBeenCalledWith([payload]);
  });

  it("uses the explicitly enabled legacy fallback when no database config resolves", async () => {
    process.env.EVENT_INGESTION_LEGACY_JSON_FALLBACK = "true";
    queryResult({ data: [{ normalized_payload: { id: "unusable" } }], error: null });
    mockToHashPokerEventConfig.mockReturnValue(null);
    mockGetHashPokerEventConfig.mockReturnValue({ id: "hash-poker", title: "Legacy" });

    const response = await get();

    expect(response.status).toBe(200);
    expect(response.headers.get("warning")).toContain("Legacy event snapshot");
    await expect(response.json()).resolves.toMatchObject({ source: "legacy-json-fallback" });
  });

  it("fails closed without fallback when the database feed is unavailable", async () => {
    const error = { message: "database offline" };
    queryResult({ data: null, error });
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await get();

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ error: "Event feed unavailable" });
    expect(consoleError).toHaveBeenCalledWith("Database event feed unavailable", error);
    consoleError.mockRestore();
  });
});
