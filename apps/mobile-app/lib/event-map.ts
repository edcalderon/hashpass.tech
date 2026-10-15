// Open-source map support for the public event info screen.
//
// Stack: Leaflet (rendered inside an iframe on web / a WebView on native, so
// one implementation serves both) + OpenStreetMap data. Venue coordinates are
// resolved with Nominatim. Both are free and key-less, which suits a
// low-traffic info page, but their usage policies rule out heavy traffic:
//   - tiles:     https://operations.osmfoundation.org/policies/tiles/
//   - Nominatim: https://operations.osmfoundation.org/policies/nominatim/ (max 1 req/s, cache results)
// Point EXPO_PUBLIC_MAP_TILE_URL (+ _ATTRIBUTION) at a hosted provider
// (MapTiler, Stadia, Protomaps...) if traffic grows; nothing else changes.

export interface MapCoordinates {
  lat: number;
  lng: number;
  /** Leaflet zoom level; lower when we could only resolve the city. */
  zoom: number;
}

const DEFAULT_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const DEFAULT_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors';

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const CACHE_PREFIX = 'event-map:v1:';

const memoryCache = new Map<string, MapCoordinates | null>();

const readStorage = (key: string): string | null => {
  try {
    return typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
  } catch {
    return null;
  }
};

const writeStorage = (key: string, value: string) => {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(key, value);
  } catch {
    // Storage can be unavailable (private mode, quota); the memory cache still works.
  }
};

/**
 * Candidate queries from most to least specific. DB rows often hold a long
 * "building, university, neighborhood, city" string that Nominatim cannot
 * match verbatim, so we progressively fall back to the venue, then the city.
 */
export const buildGeocodeQueries = (parts: {
  address?: string | null;
  venue?: string | null;
  city?: string | null;
  country?: string | null;
}): { query: string; zoom: number }[] => {
  const place = [parts.city, parts.country].filter(Boolean).join(', ');
  const candidates: { query: string; zoom: number }[] = [];
  const add = (query: string | null | undefined, zoom: number) => {
    const trimmed = query?.trim();
    if (trimmed && !candidates.some((c) => c.query === trimmed)) {
      candidates.push({ query: trimmed, zoom });
    }
  };
  add(parts.address, 16);
  add([parts.venue, place].filter(Boolean).join(', '), 16);
  add(place, 12);
  return candidates;
};

export const geocode = async (
  parts: Parameters<typeof buildGeocodeQueries>[0],
  signal?: AbortSignal,
): Promise<MapCoordinates | null> => {
  for (const { query, zoom } of buildGeocodeQueries(parts)) {
    const cacheKey = CACHE_PREFIX + query.toLowerCase();
    if (memoryCache.has(cacheKey)) {
      const hit = memoryCache.get(cacheKey);
      if (hit) return hit;
      continue;
    }
    const stored = readStorage(cacheKey);
    if (stored) {
      try {
        const hit = JSON.parse(stored) as MapCoordinates;
        memoryCache.set(cacheKey, hit);
        return hit;
      } catch {
        // Corrupt entry: fall through and refetch.
      }
    }

    // Nominatim is an external geocoder; apiClient is scoped to Hashpass APIs.
    // eslint-disable-next-line no-restricted-syntax
    const response = await fetch(
      `${NOMINATIM_URL}?format=jsonv2&limit=1&q=${encodeURIComponent(query)}`,
      { signal, headers: { Accept: 'application/json' } },
    );
    if (!response.ok) throw new Error(`Geocoding failed (${response.status})`);
    const results = (await response.json()) as { lat: string; lon: string }[];
    const first = results[0];
    const lat = first ? Number(first.lat) : NaN;
    const lng = first ? Number(first.lon) : NaN;
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      const hit = { lat, lng, zoom };
      memoryCache.set(cacheKey, hit);
      writeStorage(cacheKey, JSON.stringify(hit));
      return hit;
    }
    // Only cache misses in memory so a transient gap is retried next session.
    memoryCache.set(cacheKey, null);
  }
  return null;
};

export const openStreetMapUrl = ({ lat, lng, zoom }: MapCoordinates) =>
  `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=${zoom}/${lat}/${lng}`;

export const openStreetMapSearchUrl = (query: string) =>
  `https://www.openstreetmap.org/search?query=${encodeURIComponent(query)}`;

/** Keep iframe navigation local while sending attribution links to the OS. */
export const isEventMapNavigationAllowed = (rawUrl: string): boolean => {
  if (rawUrl.startsWith('about:')) return true;
  try {
    const parsed = new URL(rawUrl);
    return parsed.origin === 'https://hashpass.tech';
  } catch {
    // Fall through to external open for invalid or unexpected URLs.
    return false;
  }
};

// JSON for embedding in an inline <script>; "<" is escaped so a value can
// never close the script tag.
const toScriptJson = (value: unknown) => JSON.stringify(value).replace(/</g, '\\u003c');

export const buildMapHtml = ({
  coordinates,
  label,
  accent,
  isDark,
  surface,
  animated,
}: {
  coordinates: MapCoordinates;
  label: string;
  accent: string;
  isDark: boolean;
  surface: string;
  animated: boolean;
}): string => {
  const tileUrl = process.env.EXPO_PUBLIC_MAP_TILE_URL || DEFAULT_TILE_URL;
  const attribution = process.env.EXPO_PUBLIC_MAP_TILE_ATTRIBUTION || DEFAULT_ATTRIBUTION;
  const config = toScriptJson({ ...coordinates, label, tileUrl, attribution, animated });

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
  integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin="" />
<style>
  html, body, #map { height: 100%; margin: 0; background: ${surface}; }
  .leaflet-container { font: 12px/1.4 system-ui, sans-serif; }
  ${isDark ? '.leaflet-tile-pane { filter: invert(1) hue-rotate(180deg) brightness(0.95) contrast(0.9); }' : ''}
  .leaflet-control-attribution { background: ${isDark ? 'rgba(20,20,24,.7)' : 'rgba(255,255,255,.75)'} !important; color: ${isDark ? '#bbb' : '#444'}; }
  .leaflet-control-attribution a { color: inherit; }
  .pin { position: relative; width: 22px; height: 22px; }
  .pin::before { content: ''; position: absolute; inset: 0; border-radius: 50%; background: ${accent};
    border: 3px solid #fff; box-shadow: 0 2px 8px rgba(0,0,0,.35); }
  .pin::after { content: ''; position: absolute; inset: -6px; border-radius: 50%; background: ${accent};
    opacity: .25; animation: pulse 2.4s ease-out infinite; }
  @keyframes pulse { 0% { transform: scale(.6); opacity: .45; } 100% { transform: scale(1.6); opacity: 0; } }
  @media (prefers-reduced-motion: reduce) { .pin::after { animation: none; } }
</style>
</head>
<body>
<div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"
  integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin=""></script>
<script>
  var c = ${config};
  var map = L.map('map', { zoomControl: true, scrollWheelZoom: false, attributionControl: true })
    .setView([c.lat, c.lng], c.animated ? c.zoom - 3 : c.zoom);
  map.attributionControl.setPrefix(false);
  L.tileLayer(c.tileUrl, { maxZoom: 19, attribution: c.attribution }).addTo(map);
  var marker = L.marker([c.lat, c.lng], {
    title: c.label,
    keyboard: false,
    icon: L.divIcon({ className: '', html: '<div class="pin"></div>', iconSize: [22, 22], iconAnchor: [11, 11] })
  }).addTo(map);
  // Wheel-zoom would hijack page scrolling, so it is opt-in via a click.
  map.once('focus', function () { map.scrollWheelZoom.enable(); });
  if (c.animated) { map.flyTo([c.lat, c.lng], c.zoom, { duration: 1.4 }); }
</script>
</body>
</html>`;
};
