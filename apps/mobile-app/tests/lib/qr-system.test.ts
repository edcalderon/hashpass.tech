/// <reference types="jest" />

const mockGet = jest.fn();
const mockPost = jest.fn();

jest.mock("../../lib/api-client", () => ({
  apiClient: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
  },
}));

import { qrSystemService as qr } from "../../lib/qr-system";

const ok = (data: unknown) => ({ success: true, data });
const fail = (error = "bad") => ({ success: false, error });

const code = (over: Record<string, unknown> = {}) => ({
  id: "qr-1", token: "tok", qr_data: { k: 1 }, status: "active", user_id: "u1", ...over,
});

describe("qrSystemService", () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockPost.mockReset();
    jest.spyOn(console, "error").mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  describe("generatePassQR", () => {
    it("posts to the backend with defaults and unwraps the envelope", async () => {
      mockPost.mockResolvedValue(ok({ data: code() }));
      expect(await qr.generatePassQR("p1")).toEqual({ qrId: "qr-1", token: "tok", qrData: { k: 1 } });
      expect(mockPost).toHaveBeenCalledWith(
        "/qr/pass",
        { passId: "p1", expiresInMinutes: 30, maxUses: 1 },
        { skipEventSegment: true, params: undefined },
      );
    });

    it("honours custom options and accepts an un-enveloped payload", async () => {
      mockPost.mockResolvedValue(ok(code()));
      await qr.generatePassQR("p1", { expiresInMinutes: 5, maxUses: 3 });
      expect(mockPost.mock.calls[0][1]).toEqual({ passId: "p1", expiresInMinutes: 5, maxUses: 3 });
    });

    it("returns null when the backend returns nothing or fails", async () => {
      mockPost.mockResolvedValueOnce(ok({ data: null }));
      expect(await qr.generatePassQR("p1")).toBeNull();
      mockPost.mockResolvedValueOnce(ok(null));
      expect(await qr.generatePassQR("p1")).toBeNull();
      mockPost.mockResolvedValueOnce(fail());
      expect(await qr.generatePassQR("p1")).toBeNull();
      mockPost.mockResolvedValueOnce({ success: false });
      expect(await qr.generatePassQR("p1")).toBeNull();
    });
  });

  describe("lookups", () => {
    it("gets a QR by id and token", async () => {
      mockGet.mockResolvedValue(ok({ data: code() }));
      expect((await qr.getQRById("qr-1"))?.id).toBe("qr-1");
      expect(mockGet).toHaveBeenLastCalledWith("/qr/lookup", { skipEventSegment: true, params: { id: "qr-1" } });
      expect((await qr.getQRByToken("tok"))?.id).toBe("qr-1");
      expect(mockGet).toHaveBeenLastCalledWith("/qr/lookup", { skipEventSegment: true, params: { token: "tok" } });
    });

    it("returns null on lookup failure", async () => {
      mockGet.mockResolvedValue(fail());
      expect(await qr.getQRById("x")).toBeNull();
      expect(await qr.getQRByToken("x")).toBeNull();
      expect(await qr.getActiveQRForPass("x")).toBeNull();
    });

    it("selects the active QR for a pass", async () => {
      mockGet.mockResolvedValue(ok({ data: [code({ id: "old", status: "revoked" }), code({ id: "live" })] }));
      expect((await qr.getActiveQRForPass("p1"))?.id).toBe("live");
      mockGet.mockResolvedValue(ok({ data: [code({ status: "used" })] }));
      expect(await qr.getActiveQRForPass("p1")).toBeNull();
      mockGet.mockResolvedValue(ok({ data: null }));
      expect(await qr.getActiveQRForPass("p1")).toBeNull();
    });

    it("filters the user's codes by owner and status", async () => {
      mockGet.mockResolvedValue(ok({ data: [
        code({ id: "a" }), code({ id: "b", status: "used" }), code({ id: "c", user_id: "other" }),
      ] }));
      expect((await qr.getUserQRCodes("u1")).map((c: { id: string }) => c.id)).toEqual(["a", "b"]);
      expect((await qr.getUserQRCodes("u1", "used" as any)).map((c: { id: string }) => c.id)).toEqual(["b"]);
      expect(mockGet).toHaveBeenLastCalledWith("/qr/lookup", { skipEventSegment: true, params: { owner: true } });
      mockGet.mockResolvedValue(ok({ data: null }));
      expect(await qr.getUserQRCodes("u1")).toEqual([]);
      mockGet.mockResolvedValue(fail());
      expect(await qr.getUserQRCodes("u1")).toEqual([]);
    });
  });

  describe("validation", () => {
    it("consumes a QR on validateAndUseQR", async () => {
      mockPost.mockResolvedValue(ok({ data: { valid: true, status: "used" } }));
      expect(await qr.validateAndUseQR("tok", "scanner", "dev-1")).toEqual({ valid: true, status: "used" });
      expect(mockPost.mock.calls[0][1]).toEqual({ token: "tok", scannerDeviceId: "dev-1", consume: true });
    });

    it("previews without consuming on checkQRValidity", async () => {
      mockPost.mockResolvedValue(ok({ data: { valid: true, status: "active" } }));
      expect((await qr.checkQRValidity("tok")).valid).toBe(true);
      expect(mockPost.mock.calls[0][1]).toEqual({ token: "tok", consume: false });
    });

    it("fails closed on empty or failed responses", async () => {
      mockPost.mockResolvedValue(ok({ data: null }));
      expect(await qr.validateAndUseQR("t")).toMatchObject({ valid: false, message: "Error validating QR code" });
      expect(await qr.checkQRValidity("t")).toMatchObject({ valid: false, message: "Error checking QR code" });
      mockPost.mockResolvedValue(fail());
      expect(await qr.validateAndUseQR("t")).toMatchObject({ valid: false, status: "invalid" });
      expect(await qr.checkQRValidity("t")).toMatchObject({ valid: false, status: "invalid" });
    });
  });

  describe("admin actions", () => {
    it.each([
      ["revokeQR", () => qr.revokeQR("t", "admin", "why"), "/qr/admin", { token: "t", reason: "why" }],
      ["revokeQR without reason", () => qr.revokeQR("t", "admin"), "/qr/admin", { token: "t", reason: null }],
      ["suspendQR", () => qr.suspendQR("t", "admin"), "/qr/admin/suspend", { token: "t" }],
      ["reactivateQR", () => qr.reactivateQR("t", "admin"), "/qr/admin/reactivate", { token: "t" }],
    ])("%s returns the backend success flag", async (_name, run, path, body) => {
      mockPost.mockResolvedValue(ok({ success: true }));
      expect(await run()).toBe(true);
      expect(mockPost).toHaveBeenLastCalledWith(path, body, { skipEventSegment: true });
      mockPost.mockResolvedValue(ok({ success: false }));
      expect(await run()).toBe(false);
      mockPost.mockResolvedValue(fail());
      expect(await run()).toBe(false);
      mockPost.mockRejectedValue(new Error("net"));
      expect(await run()).toBe(false);
    });

    it("loads scan logs", async () => {
      mockGet.mockResolvedValue(ok({ data: [{ id: 1 }] }));
      expect(await qr.getQRScanLogs("qr-1")).toEqual([{ id: 1 }]);
      expect(mockGet).toHaveBeenCalledWith("/qr/admin/logs", { skipEventSegment: true, params: { qr_code_id: "qr-1" } });
      mockGet.mockResolvedValue(ok({}));
      expect(await qr.getQRScanLogs("qr-1")).toEqual([]);
      mockGet.mockResolvedValue(fail());
      expect(await qr.getQRScanLogs("qr-1")).toEqual([]);
      mockGet.mockRejectedValue(new Error("net"));
      expect(await qr.getQRScanLogs("qr-1")).toEqual([]);
    });
  });

  describe("generateQRPayload", () => {
    it("builds a JSON payload by default", () => {
      const payload = JSON.parse(qr.generateQRPayload("  tok  "));
      expect(payload).toMatchObject({ type: "hashpass_qr", token: "tok" });
      expect(typeof payload.timestamp).toBe("number");
    });

    it("builds a verify URL with an encoded token", () => {
      expect(qr.generateQRPayload("a b", "https://hashpass.tech")).toBe("https://hashpass.tech/qr/verify?token=a%20b");
    });

    it("rejects empty tokens", () => {
      expect(() => qr.generateQRPayload("")).toThrow("Invalid token");
      expect(() => qr.generateQRPayload("   ")).toThrow("Invalid token");
      expect(() => qr.generateQRPayload(undefined as any)).toThrow("Invalid token");
    });
  });

  describe("generateWalletTransferQR", () => {
    it("posts wallet details with defaults", async () => {
      mockPost.mockResolvedValue(ok({ data: { id: "w1", token: "wt", qr_data: { a: 1 } } }));
      expect(await qr.generateWalletTransferQR("u1", "0xabc", 5)).toEqual({ qrId: "w1", token: "wt", qrData: { a: 1 } });
      expect(mockPost.mock.calls[0][1]).toEqual({
        walletAddress: "0xabc", amount: 5, currency: "VOI", expiresInMinutes: 60, maxUses: 1,
      });
    });

    it("honours options and fails to null", async () => {
      mockPost.mockResolvedValueOnce(ok({ data: { id: "w1", token: "wt", qr_data: {} } }));
      await qr.generateWalletTransferQR("u1", "0xabc", undefined, "USDC", { expiresInMinutes: 10, maxUses: 2 });
      expect(mockPost.mock.calls[0][1]).toMatchObject({ currency: "USDC", expiresInMinutes: 10, maxUses: 2 });
      mockPost.mockResolvedValueOnce(ok({ data: null }));
      expect(await qr.generateWalletTransferQR("u1", "0xabc")).toBeNull();
      mockPost.mockResolvedValueOnce(fail());
      expect(await qr.generateWalletTransferQR("u1", "0xabc")).toBeNull();
    });
  });
});
