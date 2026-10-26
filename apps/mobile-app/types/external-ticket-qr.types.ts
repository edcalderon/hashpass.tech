/** A third-party ticket QR (for example Blockchain Summit LATAM ticketing). */
export interface ExternalTicketQr {
  /** Raw scanned text; this is the proof that is fingerprinted server-side. */
  raw: string;
  /** Ticket reference extracted from the QR, upper-cased. Absent when the QR carries none we can read. */
  ticketCode?: string;
  /** Normalised issuer id, shared with the claim API. */
  issuer: string;
  /** Human label such as the originating hostname. */
  issuerLabel: string;
  /** Event the ticket appears to belong to, when the payload names one. */
  eventId?: string;
  /** Readable, non-sensitive extras (holder name, ticket type) for the reviewer. */
  metadata: Record<string, string>;
}
