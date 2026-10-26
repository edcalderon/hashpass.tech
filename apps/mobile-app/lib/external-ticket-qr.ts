import type { ExternalTicketQr } from "../types/external-ticket-qr.types";

export const DEFAULT_TICKET_ISSUER = "blockchain_summit_latam";

/** Events a third-party ticket can be exchanged for. */
export const EXTERNAL_TICKET_EVENTS = [
  { id: "colombia2026", label: "BSL Colombia 2026" },
  { id: "chile2026", label: "BSL Chile 2026" },
] as const;

const CODE_KEYS = [
  "ticketCode", "ticket_code", "ticketId", "ticket_id", "ticket", "code",
  "qr", "qrCode", "qr_code", "barcode", "id", "uuid", "token", "reference", "ref",
];
const META_KEYS: Record<string, string> = {
  name: "holder", holder: "holder", attendee: "holder", fullName: "holder", full_name: "holder",
  email: "holderEmail", type: "ticketType", ticketType: "ticketType", ticket_type: "ticketType",
  tier: "ticketType", event: "eventName", eventName: "eventName", event_name: "eventName",
  order: "order", orderId: "order", order_id: "order",
};
const CODE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_\-:.]{3,127}$/;
const TICKET_PATH_MARKERS = new Set(["t", "ticket", "tickets", "e", "event", "events", "qr", "c", "check-in", "checkin", "claim", "validate"]);

const scalar = (value: unknown): string | undefined => {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
};

/** Guess the event from free text such as a URL slug or an event name. */
export function guessTicketEvent(text: string): string | undefined {
  const lower = text.toLowerCase();
  if (/colombia|bogot|medell/.test(lower)) return "colombia2026";
  if (/chile|santiago/.test(lower)) return "chile2026";
  return undefined;
}

const issuerFor = (host?: string): { issuer: string; issuerLabel: string } => {
  if (!host) return { issuer: DEFAULT_TICKET_ISSUER, issuerLabel: "Blockchain Summit LATAM" };
  const lower = host.toLowerCase();
  if (lower === "blckchn.xyz" || lower.endsWith(".blckchn.xyz") || lower.includes("blockchainsummit")) {
    return { issuer: DEFAULT_TICKET_ISSUER, issuerLabel: "Blockchain Summit LATAM" };
  }
  return { issuer: `ext-${lower.replace(/^www\./, "").replace(/[^a-z0-9]+/g, "-").slice(0, 48)}`, issuerLabel: lower.replace(/^www\./, "") };
};

const collectMetadata = (source: Record<string, unknown>, into: Record<string, string>) => {
  for (const [key, target] of Object.entries(META_KEYS)) {
    const value = scalar(source[key]);
    if (value && !into[target]) into[target] = value.slice(0, 120);
  }
};

const pickCode = (source: Record<string, unknown>): string | undefined => {
  for (const key of CODE_KEYS) {
    const value = scalar(source[key]);
    if (value && CODE_PATTERN.test(value)) return value.toUpperCase();
  }
  return undefined;
};

/**
 * Read an original-ticket QR. Any readable text is a valid ticket candidate:
 * a URL (code in a query parameter or the last path segment), a JSON object,
 * or a bare reference. Returns null only when there is nothing to inspect.
 */
export function parseExternalTicketQr(data: string): ExternalTicketQr | null {
  const raw = typeof data === "string" ? data.trim() : "";
  if (!raw || raw.length > 8192) return null;
  const metadata: Record<string, string> = {};

  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const object = parsed as Record<string, unknown>;
      collectMetadata(object, metadata);
      const eventText = [object.eventId, object.event_id, object.event, object.eventName, object.event_name]
        .map(scalar).filter(Boolean).join(" ");
      return {
        raw,
        ticketCode: pickCode(object),
        ...issuerFor(scalar(object.issuer) || scalar(object.host)),
        eventId: guessTicketEvent(eventText),
        metadata,
      };
    }
  } catch {
    // Not JSON.
  }

  try {
    const url = new URL(raw);
    if (url.protocol === "http:" || url.protocol === "https:") {
      const params = Object.fromEntries(url.searchParams.entries());
      collectMetadata(params, metadata);
      const segments = url.pathname.split("/").filter(Boolean).map((part) => decodeURIComponent(part));
      const pathCode = [...segments].reverse()
        .find((part) => CODE_PATTERN.test(part) && !TICKET_PATH_MARKERS.has(part.toLowerCase()) && !/^bsl-/i.test(part));
      return {
        raw,
        ticketCode: pickCode(params) || (pathCode ? pathCode.toUpperCase() : undefined),
        ...issuerFor(url.hostname),
        eventId: guessTicketEvent(`${url.pathname} ${url.search}`),
        metadata,
      };
    }
  } catch {
    // Not a URL.
  }

  return {
    raw,
    ticketCode: CODE_PATTERN.test(raw) ? raw.toUpperCase() : undefined,
    ...issuerFor(),
    eventId: guessTicketEvent(raw),
    metadata,
  };
}
