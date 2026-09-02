/**
 * Allies shown beside an event on the desktop sign-in screen.
 *
 * These ids deliberately stay separate from the event registry: an ally is a
 * reusable partner brand, while an event chooses which of those brands it is
 * permitted to display. The hosting event is always represented by its own
 * official logo. Hash Poker Room is the platform's mandatory sponsor/ally and
 * is included once for every event.
 */
import type { ImageSourcePropType } from "react-native";

export const DEFAULT_AUTH_ALLY_ID = "hash-poker-room" as const;

export const AUTH_ALLIES = [
  {
    id: "hash-poker-room",
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
export type AuthAlly = {
  id: string;
  name: string;
  logo: ImageSourcePropType;
  colors: readonly [string, string, string];
  accent: string;
};

type EventAuthAllyConfig = {
  id: string;
  name: string;
  shortName?: string;
  branding: {
    logo: string;
    primaryColor: string;
    secondaryColor?: string;
  };
  authAllyIds?: readonly string[];
};

const AUTH_ALLY_IDS = new Set<string>(AUTH_ALLIES.map((ally) => ally.id));

/**
 * Validates a stored admin allowlist. Invalid/duplicate IDs are ignored so an
 * old or malformed row cannot expose a brand an event administrator did not
 * choose. Hash Poker Room and the event's own logo are resolved separately
 * and cannot be removed.
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

const colorWithAlpha = (hex: string, alpha: number): string => {
  const normalized = hex.trim().replace(/^#/, "");
  if (!/^[0-9a-f]{6}$/i.test(normalized)) return `rgba(252, 209, 22, ${alpha})`;
  const value = Number.parseInt(normalized, 16);
  const red = (value >> 16) & 255;
  const green = (value >> 8) & 255;
  const blue = value & 255;
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
};

/**
 * Resolves the one brand that must be present on every event sign-in panel:
 * the event itself. This keeps a CBW tenant from ever rendering a BSL, Hash
 * Poker, or generic HashPass mark as its primary event card.
 */
export function getEventAuthAllies(
  event?: EventAuthAllyConfig | null,
  ids?: unknown,
): AuthAlly[] {
  if (!event?.id || !event.branding?.logo) return getAuthAllies(ids);

  const primary = event.branding.primaryColor || "#FCD116";
  const secondary = event.branding.secondaryColor || "#050507";
  const eventAlly: AuthAlly = {
    id: event.id,
    name: event.shortName || event.name,
    logo: { uri: event.branding.logo },
    colors: [secondary, secondary, primary],
    accent: colorWithAlpha(primary, 0.54),
  };

  return [
    eventAlly,
    ...getAuthAllies(ids).filter((ally) => ally.id !== event.id),
  ];
}
