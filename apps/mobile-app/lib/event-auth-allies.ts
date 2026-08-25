/**
 * Allies shown beside an event on the desktop sign-in screen.
 *
 * These ids deliberately stay separate from the event registry: an ally is a
 * reusable partner brand, while an event chooses which of those brands it is
 * permitted to display. Hash Poker Room is part of the platform default and
 * is therefore included for every event, including events without a saved
 * administrator override.
 */
export const DEFAULT_AUTH_ALLY_ID = "hash-poker-room" as const;

export const AUTH_ALLIES = [
  {
    id: DEFAULT_AUTH_ALLY_ID,
    name: "Hash Poker Room",
    logo: require("../assets/logos/hash-poker/hash-poker-room-logo.webp"),
    colors: ["#10080c", "#4c0b0b", "#c52e26"] as const,
    accent: "rgba(255, 115, 91, 0.54)",
  },
  {
    id: "bsl",
    name: "Blockchain Summit Latam",
    logo: require("../assets/logos/bsl/BSL-Logo-fondo-oscuro-2024.webp"),
    colors: ["#071927", "#0b4267", "#129fc1"] as const,
    accent: "rgba(79, 209, 241, 0.5)",
  },
] as const;

export type AuthAllyId = (typeof AUTH_ALLIES)[number]["id"];
export type AuthAlly = (typeof AUTH_ALLIES)[number];

type EventAuthAllyConfig = {
  authAllyIds?: readonly string[];
};

const AUTH_ALLY_IDS = new Set<string>(AUTH_ALLIES.map((ally) => ally.id));

/**
 * Validates a stored admin allowlist and makes the platform default explicit.
 * Invalid/duplicate IDs are ignored so an old or malformed row cannot expose
 * a brand an event administrator did not choose.
 */
export function normalizeAuthAllyIds(ids: unknown): AuthAllyId[] {
  const allowed = new Set<AuthAllyId>([DEFAULT_AUTH_ALLY_ID]);

  if (Array.isArray(ids)) {
    for (const value of ids) {
      if (typeof value !== "string") continue;
      const id = value.trim().toLowerCase();
      if (AUTH_ALLY_IDS.has(id)) {
        allowed.add(id as AuthAllyId);
      }
    }
  }

  return AUTH_ALLIES.map((ally) => ally.id).filter((id) => allowed.has(id));
}

/** Returns an event's checked-in safe fallback when no admin override exists. */
export function getConfiguredAuthAllyIds(
  event?: EventAuthAllyConfig | null,
): AuthAllyId[] {
  return normalizeAuthAllyIds(event?.authAllyIds);
}

export function getAuthAllies(ids: unknown): AuthAlly[] {
  const allowed = new Set(normalizeAuthAllyIds(ids));
  return AUTH_ALLIES.filter((ally) => allowed.has(ally.id));
}
