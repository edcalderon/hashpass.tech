import {
  buildGeocodeQueries,
  buildMapHtml,
  geocode,
  isEventMapNavigationAllowed,
  openStreetMapSearchUrl,
  openStreetMapUrl,
} from "../../lib/event-map";

const fetchMock = jest.fn();
const storage = new Map<string, string>();

beforeEach(() => {
  fetchMock.mockReset();
  storage.clear();
  Object.defineProperty(globalThis, "fetch", {
    configurable: true,
    value: fetchMock,
  });
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: jest.fn((key: string) => storage.get(key) ?? null),
      setItem: jest.fn((key: string, value: string) => storage.set(key, value)),
    },
  });
});

describe("event-map", () => {
  it("orders geocode queries from most to least specific and drops duplicates", () => {
    expect(
      buildGeocodeQueries({
        address: "Cra 40 #22C-67, Bogotá",
        venue: "Corferias",
        city: "Bogotá",
        country: "Colombia",
      }),
    ).toEqual([
      { query: "Cra 40 #22C-67, Bogotá", zoom: 16 },
      { query: "Corferias, Bogotá, Colombia", zoom: 16 },
      { query: "Bogotá, Colombia", zoom: 12 },
    ]);
    expect(buildGeocodeQueries({ venue: "Bogotá, Colombia", city: "Bogotá", country: "Colombia" })).toEqual([
      { query: "Bogotá, Colombia, Bogotá, Colombia", zoom: 16 },
      { query: "Bogotá, Colombia", zoom: 12 },
    ]);
    expect(buildGeocodeQueries({})).toEqual([]);
  });

  it("links to the pinned OpenStreetMap location", () => {
    expect(openStreetMapUrl({ lat: 4.6, lng: -74.1, zoom: 16 })).toBe(
      "https://www.openstreetmap.org/?mlat=4.6&mlon=-74.1#map=16/4.6/-74.1",
    );
    expect(openStreetMapSearchUrl("Corferias, Bogotá")).toBe(
      "https://www.openstreetmap.org/search?query=Corferias%2C%20Bogot%C3%A1",
    );
  });

  it("allows only the map's own origin and about URLs to stay in the WebView", () => {
    expect(isEventMapNavigationAllowed("about:blank")).toBe(true);
    expect(isEventMapNavigationAllowed("https://hashpass.tech/events/colombia2026")).toBe(true);
    expect(isEventMapNavigationAllowed("https://hashpass.tech.evil.example/steal")).toBe(false);
    expect(isEventMapNavigationAllowed("https://other.example/attribution")).toBe(false);
    expect(isEventMapNavigationAllowed("not a URL")).toBe(false);
  });

  it("uses memory and persistent cache hits before making another geocode request", async () => {
    const stored = { lat: 4.7, lng: -74.05, zoom: 16 };
    storage.set("event-map:v1:persisted venue", JSON.stringify(stored));

    await expect(geocode({ address: "Persisted Venue" })).resolves.toEqual(stored);
    expect(fetchMock).not.toHaveBeenCalled();

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => [{ lat: "4.8", lon: "-74.06" }],
    });
    await expect(geocode({ address: "Fresh Venue" })).resolves.toEqual({ lat: 4.8, lng: -74.06, zoom: 16 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await expect(geocode({ address: "Fresh Venue" })).resolves.toEqual({ lat: 4.8, lng: -74.06, zoom: 16 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(storage.has("event-map:v1:fresh venue")).toBe(true);
  });

  it("falls back across candidates, skips invalid results, and reports provider errors", async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      .mockResolvedValueOnce({ ok: true, json: async () => [{ lat: "4.9", lon: "-74.07" }] });
    await expect(
      geocode({ address: "Unknown address", venue: "Corferias", city: "Bogotá", country: "Colombia" }),
    ).resolves.toEqual({ lat: 4.9, lng: -74.07, zoom: 16 });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => [{ lat: "bad", lon: "-74.08" }] });
    await expect(geocode({ address: "No coordinates" })).resolves.toBeNull();

    fetchMock.mockResolvedValueOnce({ ok: false, status: 503 });
    await expect(geocode({ address: "Provider failure" })).rejects.toThrow("Geocoding failed (503)");
  });

  it("refetches a corrupt persistent entry and supports dark/custom map rendering", async () => {
    storage.set("event-map:v1:corrupt venue", "not-json");
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => [{ lat: "4.6", lon: "-74.1" }] });
    await expect(geocode({ address: "Corrupt Venue" })).resolves.toEqual({ lat: 4.6, lng: -74.1, zoom: 16 });

    const previousTileUrl = process.env.EXPO_PUBLIC_MAP_TILE_URL;
    const previousAttribution = process.env.EXPO_PUBLIC_MAP_TILE_ATTRIBUTION;
    process.env.EXPO_PUBLIC_MAP_TILE_URL = "https://tiles.example/{z}/{x}/{y}.png";
    process.env.EXPO_PUBLIC_MAP_TILE_ATTRIBUTION = "Example tiles";
    try {
      const html = buildMapHtml({
        coordinates: { lat: 1, lng: 2, zoom: 10 },
        label: "Dark venue",
        accent: "#800020",
        isDark: true,
        surface: "#111",
        animated: true,
      });
      expect(html).toContain("https://tiles.example/{z}/{x}/{y}.png");
      expect(html).toContain("Example tiles");
      expect(html).toContain("filter: invert(1)");
      expect(html).toContain("c.zoom - 3");
      expect(html).toContain("map.flyTo");
    } finally {
      if (previousTileUrl === undefined) delete process.env.EXPO_PUBLIC_MAP_TILE_URL;
      else process.env.EXPO_PUBLIC_MAP_TILE_URL = previousTileUrl;
      if (previousAttribution === undefined) delete process.env.EXPO_PUBLIC_MAP_TILE_ATTRIBUTION;
      else process.env.EXPO_PUBLIC_MAP_TILE_ATTRIBUTION = previousAttribution;
    }
  });

  it("cannot be broken out of its inline script by a hostile venue label", () => {
    const html = buildMapHtml({
      coordinates: { lat: 1, lng: 2, zoom: 10 },
      label: "</script><script>alert(1)</script>",
      accent: "#800020",
      isDark: false,
      surface: "#fff",
      animated: false,
    });
    expect(html).not.toContain("</script><script>alert(1)");
    expect(html).toContain("\\u003c/script>");
  });
});
