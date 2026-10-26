/// <reference types="jest" />

import { guessTicketEvent, parseExternalTicketQr } from "../../lib/external-ticket-qr";

describe("parseExternalTicketQr", () => {
  it("reads a BSL ticket link", () => {
    expect(parseExternalTicketQr("https://bsl.blckchn.xyz/e/bsl-colombia-2026/t/AB12CD34EF")).toMatchObject({
      ticketCode: "AB12CD34EF",
      issuer: "blockchain_summit_latam",
      eventId: "colombia2026",
    });
  });

  it("prefers an explicit code query parameter and keeps readable metadata", () => {
    const result = parseExternalTicketQr("https://events.blckchn.xyz/validate?code=zz99xx88&name=Ada&type=General");
    expect(result).toMatchObject({ ticketCode: "ZZ99XX88", metadata: { holder: "Ada", ticketType: "General" } });
  });

  it("reads JSON ticket payloads and names the event", () => {
    expect(parseExternalTicketQr(JSON.stringify({ ticketId: "t-1234abcd", event: "BSL Chile 2026" }))).toMatchObject({
      ticketCode: "T-1234ABCD",
      eventId: "chile2026",
    });
  });

  it("accepts a bare reference and an unreadable payload for review", () => {
    expect(parseExternalTicketQr("ab-12cd-3456")).toMatchObject({ ticketCode: "AB-12CD-3456" });
    const opaque = parseExternalTicketQr("some opaque text with spaces");
    expect(opaque).toMatchObject({ issuer: "blockchain_summit_latam" });
    expect(opaque?.ticketCode).toBeUndefined();
  });

  it("scopes unknown ticketing hosts to their own issuer", () => {
    expect(parseExternalTicketQr("https://www.ticketera.example/order/XYZ98765")).toMatchObject({
      issuer: "ext-ticketera-example",
      ticketCode: "XYZ98765",
    });
  });

  it("rejects empty and oversized input, and guesses events from text", () => {
    expect(parseExternalTicketQr("   ")).toBeNull();
    expect(parseExternalTicketQr("a".repeat(9000))).toBeNull();
    expect(guessTicketEvent("Bogotá")).toBe("colombia2026");
    expect(guessTicketEvent("nowhere")).toBeUndefined();
  });
});
