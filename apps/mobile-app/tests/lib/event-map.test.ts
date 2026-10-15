import { buildGeocodeQueries, buildMapHtml, openStreetMapUrl } from "../../lib/event-map";

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
