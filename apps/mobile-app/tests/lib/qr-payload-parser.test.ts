/// <reference types="jest" />

import { qrScannerService } from "../../lib/qr-scanner-service";

jest.mock("expo-camera", () => ({
  CameraView: "CameraView",
  getCameraPermissionsAsync: jest.fn(),
  requestCameraPermissionsAsync: jest.fn(),
}));

describe("qrScannerService.parseHashpassPayload", () => {
  it("parses a HashPass identifier from JSON", () => {
    expect(qrScannerService.parseHashpassPayload(JSON.stringify({
      type: "hpass_id",
      hpass_id: "hpass-user-1234",
      event_id: "Colombia2026",
    }))).toEqual(expect.objectContaining({
      kind: "hpass_id",
      hpassId: "hpass-user-1234",
      eventId: "colombia2026",
      isValid: true,
    }));
  });

  it("parses pass and network links without treating arbitrary URLs as tokens", () => {
    expect(qrScannerService.parseHashpassPayload(
      "https://hashpass.tech/pass/BSL-GENERAL-0001?event=colombia2026",
    )).toEqual(expect.objectContaining({
      kind: "pass_id",
      passId: "BSL-GENERAL-0001",
      isValid: true,
    }));

    expect(qrScannerService.parseHashpassPayload(
      "hashpass://network?network=ethereum&address=0xabc",
    )).toEqual(expect.objectContaining({
      kind: "wallet",
      network: "ethereum",
      address: "0xabc",
      isValid: true,
    }));

    expect(qrScannerService.parseHashpassPayload(
      "https://example.com/a-long-but-unrelated-link",
    )).toEqual(expect.objectContaining({ kind: "url", isValid: true }));

    expect(qrScannerService.parseHashpassPayload(
      "hashpass://hpass/hpass-user-1234",
    )).toEqual(expect.objectContaining({
      kind: "hpass_id",
      hpassId: "hpass-user-1234",
      isValid: true,
    }));
  });

  it("keeps minted QR tokens compatible with the existing validator", () => {
    expect(qrScannerService.parseHashpassPayload("QR-ABC12345")).toEqual(expect.objectContaining({
      kind: "qr_token",
      token: "QR-ABC12345",
      isValid: true,
    }));
  });

  it("accepts compact identifiers and explicit network payloads", () => {
    expect(qrScannerService.parseHashpassPayload("hpass-user-1234")).toEqual(expect.objectContaining({
      kind: "hpass_id",
      hpassId: "hpass-user-1234",
      isValid: true,
    }));
    expect(qrScannerService.parseHashpassPayload("pass-12345")).toEqual(expect.objectContaining({
      kind: "pass_id",
      passId: "pass-12345",
      isValid: true,
    }));
    expect(qrScannerService.parseHashpassPayload(JSON.stringify({
      type: "network",
      network: "solana",
    }))).toEqual(expect.objectContaining({
      kind: "network",
      network: "solana",
      isValid: true,
    }));
  });

  it("rejects unsupported plain text instead of guessing a token", () => {
    expect(qrScannerService.parseHashpassPayload("this is not a HashPass QR")).toEqual({
      kind: "unknown",
      raw: "this is not a HashPass QR",
      isValid: false,
    });
  });
});
