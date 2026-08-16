import type { EventConfig } from "@hashpass/types";
import { EVENTS } from "../config/events";

const apiBaseUrl = () => {
  const value = process.env.EXPO_PUBLIC_API_BASE_URL || "";
  let end = value.length;
  while (end > 0 && value.charCodeAt(end - 1) === 47) end -= 1;
  return value.slice(0, end);
};

const isHashPokerConfig = (value: unknown): value is EventConfig => {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<EventConfig>;
  return candidate.id === "hash-poker" &&
    typeof candidate.title === "string" &&
    typeof candidate.eventStartDate === "string" &&
    candidate.eventType === "whitelabel";
};

/** Installs the server-approved database event into the shared runtime registry. */
export async function refreshHashPokerRuntimeEvent(
  fetchImpl: typeof fetch = fetch,
  registry: Record<string, EventConfig> = EVENTS,
): Promise<boolean> {
  const configuredBase = apiBaseUrl();
  const response = await fetchImpl(
    configuredBase
      ? `${configuredBase}/event-sources/hash-poker`
      : "/api/event-sources/hash-poker",
  );
  if (!response.ok) throw new Error(`Event feed responded ${response.status}`);
  const body = (await response.json()) as { data?: unknown };
  if (!isHashPokerConfig(body.data)) throw new Error("Event feed returned an invalid Hash Poker configuration");
  const previous = registry["hash-poker"];
  registry["hash-poker"] = body.data;
  return JSON.stringify(previous) !== JSON.stringify(body.data);
}
