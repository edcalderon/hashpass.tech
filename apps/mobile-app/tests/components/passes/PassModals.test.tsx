/// <reference types="jest" />

import React from "react";
import TestRenderer, { act } from "react-test-renderer";

const mockShowSuccess = jest.fn();
const mockShowError = jest.fn();
const mockCreateShare = jest.fn();
const mockRequestTransfer = jest.fn();
const mockSubmitClaim = jest.fn();
const mockSetString = jest.fn();
const mockRnShare = jest.fn();
let mockPlatform = "android";

jest.mock("react-native", () => ({
  ActivityIndicator: "ActivityIndicator",
  Modal: "Modal",
  Platform: { get OS() { return mockPlatform; } },
  Pressable: "Pressable",
  ScrollView: "ScrollView",
  Share: { share: (...a: unknown[]) => mockRnShare(...a) },
  Text: "Text",
  TextInput: "TextInput",
  View: "View",
}));
jest.mock(
  "react-native-css-interop/src/runtime/native/appearance-observables",
  () => ({
    addChangeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeChangeListener: jest.fn(),
    removeEventListener: jest.fn(),
    resetAppearanceListeners: jest.fn(),
  }),
  { virtual: true },
);
jest.mock("react-native-css-interop/jsx-runtime", () => require("react/jsx-runtime"));
jest.mock("expo-clipboard", () => ({ setStringAsync: (...a: unknown[]) => mockSetString(...a) }));
jest.mock("react-native-qrcode-svg", () => "QRCode");
jest.mock("@hashpass/ui/primitives", () => ({
  ActionButton: "ActionButton",
  FormField: "FormField",
  ModalBackdrop: "ModalBackdrop",
  Surface: "Surface",
}));
jest.mock("@hashpass/ui/tokens", () => ({
  uiPalette: () => ({ text: "#000", muted: "#666", accent: "#00f", onAccent: "#fff", surface: "#fff" }),
  uiTokens: { space: { xs: 4, sm: 8, md: 12, lg: 16 }, type: { title: 20, body: 15 }, radius: { input: 8 } },
}));
jest.mock("../../../lib/vector-icons", () => ({ MaterialIcons: "MaterialIcons" }));
jest.mock("../../../hooks/useTheme", () => ({
  useTheme: () => ({ isDark: false, colors: { divider: "#ddd", primaryContrastText: "#fff" } }),
}));
jest.mock("../../../i18n/i18n", () => ({
  useTranslation: () => ({ t: (_key: string, fallback?: string) => fallback ?? _key }),
}));
jest.mock("../../../contexts/ToastContext", () => ({
  useToastHelpers: () => ({ showSuccess: mockShowSuccess, showError: mockShowError }),
}));
jest.mock("../../../lib/pass-sharing", () => ({
  createPublicPassShare: (...a: unknown[]) => mockCreateShare(...a),
  requestPassTransfer: (...a: unknown[]) => mockRequestTransfer(...a),
}));
jest.mock("../../../lib/pass-system", () => ({
  passSystemService: { getPassTypeDisplayName: (type: string) => String(type).toUpperCase() },
}));
jest.mock("../../../lib/external-ticket-claims", () => ({
  submitExternalTicketClaim: (...a: unknown[]) => mockSubmitClaim(...a),
}));
jest.mock("../../../components/QRScanner", () => ({
  __esModule: true,
  default: (props: Record<string, any>) => require("react").createElement("TicketScanner", props),
}));

import PassShareModal from "../../../components/passes/PassShareModal";
import PassUpgradeRequestModal from "../../../components/passes/PassUpgradeRequestModal";

const pass: any = {
  pass_id: "p1",
  pass_type: "vip",
  eventId: "colombia2026",
  eventName: "Colombia 2026",
  eventDateLabel: "Nov 1",
  eventLocation: "Bogotá",
};
const share = { shareId: "s1", url: "https://hpass.id/p/abc", qrValue: "https://hpass.id/p/abc", expiresAt: null };

const mount = async (el: React.ReactElement) => {
  let r!: TestRenderer.ReactTestRenderer;
  await act(async () => { r = TestRenderer.create(el); });
  return r;
};
const button = (r: TestRenderer.ReactTestRenderer, label: string) =>
  r.root.findAll((n) => (n.type as unknown) === "ActionButton" && n.props.label === label)[0];
const press = async (r: TestRenderer.ReactTestRenderer, label: string) =>
  act(async () => { await button(r, label).props.onPress(); });
const texts = (r: TestRenderer.ReactTestRenderer) =>
  r.root.findAll((n) => (n.type as unknown) === "Text").map((n) => n.props.children).flat().join(" ");

describe("PassShareModal", () => {
  const onClose = jest.fn();
  const open = () => mount(<PassShareModal pass={pass} visible onClose={onClose} />);

  beforeEach(() => {
    mockPlatform = "android";
    [mockShowSuccess, mockShowError, mockCreateShare, mockRequestTransfer, mockSetString, mockRnShare, onClose]
      .forEach((m) => m.mockReset());
    mockCreateShare.mockResolvedValue(share);
    mockSetString.mockResolvedValue(undefined);
    mockRnShare.mockResolvedValue(undefined);
    delete (global as any).navigator.share;
  });

  it("shows options and closes", async () => {
    const r = await open();
    expect(texts(r)).toContain("Share pass");
    expect(texts(r)).toMatch(/Colombia 2026\s+·\s+VIP/);
    r.root.findAll((n) => (n.type as unknown) === "Pressable").pop()!.props.onPress();
    expect(onClose).toHaveBeenCalled();
  });

  it("does nothing while hidden", async () => {
    const r = await mount(<PassShareModal pass={pass} visible={false} onClose={onClose} />);
    expect(mockCreateShare).not.toHaveBeenCalled();
    expect(r.toJSON()).toBeTruthy();
  });

  it("creates the share once and reuses it", async () => {
    const r = await open();
    await press(r, "Copy public link");
    await press(r, "Copy public link");
    expect(mockCreateShare).toHaveBeenCalledTimes(1);
    expect(mockCreateShare).toHaveBeenCalledWith("p1", "colombia2026");
    expect(mockSetString).toHaveBeenCalledWith(share.url);
    expect(mockShowSuccess).toHaveBeenCalledTimes(2);
  });

  it("reports clipboard failures", async () => {
    mockSetString.mockRejectedValue(new Error("denied"));
    const r = await open();
    await press(r, "Copy public link");
    expect(mockShowError).toHaveBeenCalledWith("Sharing unavailable", "Unable to copy the public link.");
  });

  it("reports share creation failures with the server message or a fallback", async () => {
    mockCreateShare.mockRejectedValueOnce(new Error("denied"));
    let r = await open();
    await press(r, "Copy public link");
    expect(mockShowError).toHaveBeenLastCalledWith("Sharing unavailable", "denied");
    expect(mockSetString).not.toHaveBeenCalled();
    mockCreateShare.mockRejectedValueOnce("weird");
    r = await open();
    await press(r, "Share public details");
    expect(mockShowError).toHaveBeenLastCalledWith("Sharing unavailable", "Please try again.");
  });

  it("uses the native share sheet and never includes a pass number", async () => {
    const r = await open();
    await press(r, "Share public details");
    const arg = mockRnShare.mock.calls[0][0];
    expect(arg.message).toContain("Check out this VIP pass for Colombia 2026.");
    expect(arg.message).toContain("Nov 1 · Bogotá");
    expect(arg.message).toContain(share.url);
  });

  it("omits missing date/location from the message", async () => {
    const r = await mount(<PassShareModal pass={{ ...pass, eventDateLabel: undefined, eventLocation: undefined }} visible onClose={onClose} />);
    await press(r, "Share public details");
    expect(mockRnShare.mock.calls[0][0].message).not.toContain("·");
  });

  it("uses the web share API when available, else copies", async () => {
    mockPlatform = "web";
    const webShare = jest.fn().mockResolvedValue(undefined);
    (global as any).navigator.share = webShare;
    let r = await open();
    await press(r, "Share public details");
    expect(webShare).toHaveBeenCalledWith(expect.objectContaining({ url: share.url }));
    delete (global as any).navigator.share;
    r = await open();
    await press(r, "Share public details");
    expect(mockSetString).toHaveBeenCalledWith(expect.stringContaining(share.url));
    expect(mockShowSuccess).toHaveBeenCalled();
  });

  it("ignores a cancelled share but reports other failures", async () => {
    mockRnShare.mockRejectedValueOnce(new Error("User cancelled"));
    let r = await open();
    await press(r, "Share public details");
    expect(mockShowError).not.toHaveBeenCalled();
    mockRnShare.mockRejectedValueOnce(new Error("boom"));
    r = await open();
    await press(r, "Share public details");
    expect(mockShowError).toHaveBeenCalledWith("Sharing unavailable", "Please try again.");
    mockRnShare.mockRejectedValueOnce("string failure");
    r = await open();
    await press(r, "Share public details");
    expect(mockShowError).toHaveBeenCalledTimes(2);
  });

  it("shows the public QR and navigates back", async () => {
    const r = await open();
    await press(r, "Show public QR");
    expect(r.root.findByType("QRCode" as any).props.value).toBe(share.qrValue);
    expect(texts(r)).toContain("cannot be used for admission");
    await act(async () => { r.root.findAll((n) => (n.type as unknown) === "Pressable")[0].props.onPress(); });
    expect(texts(r)).toContain("Share pass");
  });

  it("stays on options when the QR share cannot be created", async () => {
    mockCreateShare.mockRejectedValue(new Error("x"));
    const r = await open();
    await press(r, "Show public QR");
    expect(r.root.findAllByType("QRCode" as any)).toHaveLength(0);
  });

  describe("transfer", () => {
    const toTransfer = async () => {
      const r = await open();
      await press(r, "Transfer ticket securely");
      return r;
    };
    const type = (r: TestRenderer.ReactTestRenderer, value: string) =>
      act(() => { r.root.findByType("FormField" as any).props.onChangeText(value); });

    it("will not submit an empty recipient", async () => {
      const r = await toTransfer();
      expect(button(r, "Send confirmation emails").props.disabled).toBe(true);
      await press(r, "Send confirmation emails");
      expect(mockRequestTransfer).not.toHaveBeenCalled();
    });

    it("sends a trimmed request and returns to the options", async () => {
      mockRequestTransfer.mockResolvedValue({ requestId: "r1" });
      const r = await toTransfer();
      type(r, "  friend@example.com ");
      await press(r, "Send confirmation emails");
      expect(mockRequestTransfer).toHaveBeenCalledWith({ passId: "p1", eventId: "colombia2026", recipientEmail: "friend@example.com" });
      expect(mockShowSuccess).toHaveBeenCalledWith("Transfer confirmation sent", expect.any(String));
      expect(texts(r)).toContain("Share pass");
    });

    it("blocks a second submission while one is in flight", async () => {
      let resolve!: (v: unknown) => void;
      mockRequestTransfer.mockReturnValue(new Promise((res) => { resolve = res; }));
      const r = await toTransfer();
      type(r, "friend@example.com");
      await act(async () => { button(r, "Send confirmation emails").props.onPress(); });
      const sending = button(r, "Sending…");
      expect(sending.props.loading).toBe(true);
      await act(async () => { await sending.props.onPress(); });
      expect(mockRequestTransfer).toHaveBeenCalledTimes(1);
      await act(async () => resolve({ requestId: "r1" }));
    });

    it("keeps the form and reports failures", async () => {
      mockRequestTransfer.mockRejectedValueOnce(new Error("recipient has a pass"));
      const r = await toTransfer();
      type(r, "friend@example.com");
      await press(r, "Send confirmation emails");
      expect(mockShowError).toHaveBeenCalledWith("Transfer unavailable", "recipient has a pass");
      expect(r.root.findByType("FormField" as any).props.value).toBe("friend@example.com");
      mockRequestTransfer.mockRejectedValueOnce("weird");
      await press(r, "Send confirmation emails");
      expect(mockShowError).toHaveBeenLastCalledWith("Transfer unavailable", "Please try again.");
    });
  });
});

describe("PassUpgradeRequestModal", () => {
  const onClose = jest.fn();
  const open = (type: "business" | "vip" = "business") =>
    mount(<PassUpgradeRequestModal pass={{ ...pass, pass_type: "general" }} requestedPassType={type} visible onClose={onClose} />);
  const enter = (r: TestRenderer.ReactTestRenderer, value: string) =>
    act(() => { r.root.findByType("TextInput" as any).props.onChangeText(value); });

  beforeEach(() => {
    [mockShowSuccess, mockShowError, mockSubmitClaim, onClose].forEach((m) => m.mockReset());
  });

  it("labels the original ticket tier", async () => {
    expect(texts(await open("business"))).toContain("Business");
    expect(texts(await open("vip"))).toContain("VIP");
  });

  it("lets a general-pass holder claim an original VIP ticket", async () => {
    mockSubmitClaim.mockResolvedValue({ status: "validated" });
    const r = await open("business");
    await press(r, "VIP");
    enter(r, "VIP-TICKET");
    await press(r, "Send request");
    expect(mockSubmitClaim).toHaveBeenCalledWith(expect.objectContaining({ requestedPassType: "vip" }));
  });

  it("requires a ticket code", async () => {
    const r = await open();
    enter(r, "   ");
    await press(r, "Send request");
    expect(mockShowError).toHaveBeenCalledWith("Ticket code required", expect.any(String));
    expect(mockSubmitClaim).not.toHaveBeenCalled();
  });

  it("submits a claim, clears the form and closes", async () => {
    mockSubmitClaim.mockResolvedValue({ status: "validated" });
    const r = await open("vip");
    enter(r, "ABCD1234");
    await press(r, "Send request");
    expect(mockSubmitClaim).toHaveBeenCalledWith({
      eventId: "colombia2026", ticketCode: "ABCD1234", qrPayload: "", requestedPassType: "vip",
    });
    expect(mockShowSuccess).toHaveBeenCalledWith("Upgrade request sent", expect.stringContaining("verify your ticket"));
    expect(onClose).toHaveBeenCalled();
    expect(r.root.findByType("TextInput" as any).props.value).toBe("");
  });

  it("tells the user when a claim is already pending", async () => {
    mockSubmitClaim.mockResolvedValue({ status: "pending" });
    const r = await open();
    enter(r, "ABCD");
    await press(r, "Send request");
    expect(mockShowSuccess).toHaveBeenCalledWith("Upgrade request sent", expect.stringContaining("already with the event team"));
  });

  it("reports failures and keeps the dialog open", async () => {
    mockSubmitClaim.mockRejectedValueOnce(new Error("already submitted"));
    const r = await open();
    enter(r, "ABCD");
    await press(r, "Send request");
    expect(mockShowError).toHaveBeenCalledWith("Could not send request", "already submitted");
    mockSubmitClaim.mockRejectedValueOnce("weird");
    await press(r, "Send request");
    expect(mockShowError).toHaveBeenLastCalledWith("Could not send request", "Please try again.");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("ignores a second submit while sending", async () => {
    let resolve!: (v: unknown) => void;
    mockSubmitClaim.mockReturnValue(new Promise((res) => { resolve = res; }));
    const r = await open();
    enter(r, "ABCD");
    await act(async () => { button(r, "Send request").props.onPress(); });
    await act(async () => { await button(r, "Sending…").props.onPress(); });
    expect(mockSubmitClaim).toHaveBeenCalledTimes(1);
    await act(async () => resolve({ status: "validated" }));
  });

  it("captures an original ticket QR through the lazy scanner", async () => {
    mockSubmitClaim.mockResolvedValue({ status: "validated" });
    const r = await open();
    await press(r, "Scan original ticket QR");
    const scanner = r.root.findByType("TicketScanner" as any);
    expect(scanner.props.visible).toBe(true);
    let accepted: unknown;
    await act(async () => { accepted = scanner.props.onRawScan("RAW-QR"); });
    expect(accepted).toBe(true);
    expect(r.root.findAllByType("TicketScanner" as any)).toHaveLength(0);
    expect(button(r, "Original ticket QR captured")).toBeTruthy();
    enter(r, "ABCD");
    await press(r, "Send request");
    expect(mockSubmitClaim.mock.calls[0][0].qrPayload).toBe("RAW-QR");
  });

  it("closes the scanner without capturing and cancels the dialog", async () => {
    const r = await open();
    await press(r, "Scan original ticket QR");
    await act(async () => { r.root.findByType("TicketScanner" as any).props.onClose(); });
    expect(r.root.findAllByType("TicketScanner" as any)).toHaveLength(0);
    await press(r, "Cancel");
    expect(onClose).toHaveBeenCalled();
  });
});
