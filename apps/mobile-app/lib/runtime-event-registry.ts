import type { EventConfig } from "@hashpass/types";
import { EVENTS } from "../config/events";
import { getRuntimeApiBaseUrl } from "./api-client";

/**
 * Always resolve through the shared API client so localhost web dev stays on its
 * own server (or the explicit `EXPO_PUBLIC_API_TARGET`) instead of the pinned
 * deployed base. A null base means same-origin `/api`.
 */
const apiBaseUrl = () => (getRuntimeApiBaseUrl() ?? "/api").replace(/\/+$/, "");

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
  const response = await fetchImpl(`${apiBaseUrl()}/event-sources/hash-poker`);
  // A scheduled feed outage must not remove the bundled tournament fallback or
  // surface an unhandled error in the public explorer. Keep the last registry
  // value and let the next refresh recover when the source returns.
  if (!response.ok) return false;
  const body = (await response.json()) as { data?: unknown };
  if (!isHashPokerConfig(body.data)) throw new Error("Event feed returned an invalid Hash Poker configuration");
  const previous = registry["hash-poker"];
  registry["hash-poker"] = body.data;
  return JSON.stringify(previous) !== JSON.stringify(body.data);
}
