/// <reference types="jest" />

const mockGet = jest.fn();
const mockPost = jest.fn();
jest.mock("../../lib/api-client", () => ({
  apiClient: { get: (...a: unknown[]) => mockGet(...a), post: (...a: unknown[]) => mockPost(...a) },
}));

import { listExternalTicketClaims, submitExternalTicketClaim } from "../../lib/external-ticket-claims";
import { createPublicPassShare, requestPassTransfer } from "../../lib/pass-sharing";

beforeEach(() => {
  mockGet.mockReset();
  mockPost.mockReset();
});

describe("external ticket claims client", () => {
  const input = { eventId: "e", ticketCode: "ABCD" } as any;

  it("submits a claim and unwraps an enveloped or bare result", async () => {
    mockPost.mockResolvedValueOnce({ success: true, data: { data: { id: "c1" } } });
    expect(await submitExternalTicketClaim(input)).toEqual({ id: "c1" });
    expect(mockPost).toHaveBeenCalledWith("/pass-ticket-claims", input, { skipEventSegment: true });
    mockPost.mockResolvedValueOnce({ success: true, data: { id: "c2" } });
    expect(await submitExternalTicketClaim(input)).toEqual({ id: "c2" });
  });

  it("throws the API error or a fallback", async () => {
    mockPost.mockResolvedValueOnce({ success: false, error: "dup" });
    await expect(submitExternalTicketClaim(input)).rejects.toThrow("dup");
    mockPost.mockResolvedValueOnce({ success: false });
    await expect(submitExternalTicketClaim(input)).rejects.toThrow("Unable to submit the ticket claim");
  });

  it("lists claims, defaulting to an empty list", async () => {
    mockGet.mockResolvedValueOnce({ success: true, data: { data: [{ id: "c1" }] } });
    expect(await listExternalTicketClaims()).toEqual([{ id: "c1" }]);
    expect(mockGet).toHaveBeenCalledWith("/pass-ticket-claims", { skipEventSegment: true });
    mockGet.mockResolvedValueOnce({ success: true, data: {} });
    expect(await listExternalTicketClaims()).toEqual([]);
    mockGet.mockResolvedValueOnce({ success: false, error: "no" });
    await expect(listExternalTicketClaims()).rejects.toThrow("no");
    mockGet.mockResolvedValueOnce({ success: false });
    await expect(listExternalTicketClaims()).rejects.toThrow("Unable to load ticket claims");
  });
});

describe("pass sharing client", () => {
  const share = { url: "https://hpass.id/p/x", qrValue: "https://hpass.id/p/x", shareId: "s" };

  it("creates a public share and unwraps the envelope", async () => {
    mockPost.mockResolvedValueOnce({ success: true, data: { data: share } });
    expect(await createPublicPassShare("p1", "e1")).toEqual(share);
    expect(mockPost).toHaveBeenCalledWith("/pass-shares", { passId: "p1", eventId: "e1" }, { skipEventSegment: true });
    mockPost.mockResolvedValueOnce({ success: true, data: share });
    expect(await createPublicPassShare("p1")).toEqual(share);
  });

  it("rejects failed or incomplete shares", async () => {
    mockPost.mockResolvedValueOnce({ success: false, error: "denied" });
    await expect(createPublicPassShare("p1")).rejects.toThrow("denied");
    mockPost.mockResolvedValueOnce({ success: false });
    await expect(createPublicPassShare("p1")).rejects.toThrow("Unable to create a public pass link");
    mockPost.mockResolvedValueOnce({ success: true, data: { data: { url: "u" } } });
    await expect(createPublicPassShare("p1")).rejects.toThrow("incomplete");
    mockPost.mockResolvedValueOnce({ success: true, data: null });
    await expect(createPublicPassShare("p1")).rejects.toThrow("incomplete");
  });

  it("requests a transfer", async () => {
    mockPost.mockResolvedValueOnce({ success: true, data: { data: { requestId: "r1" } } });
    expect(await requestPassTransfer({ passId: "p1", recipientEmail: "a@b.co" })).toEqual({ requestId: "r1" });
    expect(mockPost).toHaveBeenCalledWith(
      "/pass-transfers",
      { action: "request", passId: "p1", recipientEmail: "a@b.co" },
      { skipEventSegment: true },
    );
  });

  it("rejects failed or incomplete transfers", async () => {
    mockPost.mockResolvedValueOnce({ success: false, error: "nope" });
    await expect(requestPassTransfer({ passId: "p", recipientEmail: "a@b.co" })).rejects.toThrow("nope");
    mockPost.mockResolvedValueOnce({ success: false });
    await expect(requestPassTransfer({ passId: "p", recipientEmail: "a@b.co" })).rejects.toThrow("Unable to start the ticket transfer");
    mockPost.mockResolvedValueOnce({ success: true, data: { data: {} } });
    await expect(requestPassTransfer({ passId: "p", recipientEmail: "a@b.co" })).rejects.toThrow("incomplete");
  });
});
